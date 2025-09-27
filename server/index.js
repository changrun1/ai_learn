// server.js - Express 後端主文件
// 先載入根目錄的 .env 文件，再載入本地的 .env 文件
require('dotenv').config({ path: '../.env' });
require('dotenv').config(); // 載入本地 .env（會覆蓋根目錄的相同配置）

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenAI, Type } = require('@google/genai');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// 確保上傳目錄存在
const path = require('path');
const uploadDir = path.join(__dirname, 'uploads');
fs.access(uploadDir).catch(async () => {
  await fs.mkdir(uploadDir, { recursive: true });
  console.log('創建 uploads 目錄');
});

// 配置
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:8080', 'http://127.0.0.1:8080'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Gemini AI 配置
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// 文件上傳配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    console.log('上傳文件信息:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    const allowedTypes = [
      'text/plain', 
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件類型: ${file.mimetype}。支持的類型: TXT, PDF, DOCX`), false);
    }
  },
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB 限制
    files: 1 // 只允許上傳一個文件
  }
});

// 文件解析函數
async function parseFile(filePath, mimeType) {
  try {
    const buffer = await fs.readFile(filePath);
    
    switch (mimeType) {
      case 'text/plain':
        return buffer.toString();
        
      case 'application/pdf':
        const pdfData = await pdf(buffer);
        return pdfData.text;
        
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
        
      default:
        throw new Error('不支持的文件類型');
    }
  } catch (error) {
    throw new Error(`文件解析失败: ${error.message}`);
  }
}

// 提取關鍵知識點
async function extractKeyPoints(content) {
  try {
    const attempt = async () => {
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
        contents: [
          `請分析以下教材內容，提取關鍵知識點：\n\n教材內容：\n${content}\n\n請以結構化的JSON格式返回，包含：\n1. 主要主題 (topics)\n2. 重要概念 (concepts) \n3. 關鍵事實 (facts)\n4. 教材摘要 (summary)`
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT, properties: { topics:{ type:Type.ARRAY, items:{ type:Type.STRING } }, concepts:{ type:Type.ARRAY, items:{ type:Type.OBJECT, properties:{ name:{ type:Type.STRING }, description:{ type:Type.STRING } } } }, facts:{ type:Type.ARRAY, items:{ type:Type.STRING } }, summary:{ type:Type.STRING } } },
          thinkingConfig: { thinkingBudget: 0 }
        }
      });
      return JSON.parse(response.text);
    };

    const maxRetries = 2;
    let lastErr;
    for (let i=0;i<=maxRetries;i++) {
      try { return await attempt(); } catch(e){
        lastErr = e;
        if (!/UNAVAILABLE|503|timeout|unavailable/i.test(e.message) || i===maxRetries) break;
        const delay = 500 * Math.pow(2,i) + Math.random()*300;
        await new Promise(r=>setTimeout(r, delay));
      }
    }
    // fallback 簡易抽取：取前 3 行當主題，分句取 facts
    const lines = content.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    const firstBlock = lines.slice(0,3);
    const facts = content.split(/[。.!?\n]/).map(s=>s.trim()).filter(s=>s.length>8).slice(0,8);
    return { topics: firstBlock.slice(0,3), concepts: [], facts, summary: lines.join(' ').slice(0,400) };
  } catch (error) {
    throw new Error(`知識點提取失败: ${error.message}`);
  }
}

// 生成題目
async function generateQuestions(content, keyPoints, difficulty = 'medium', totalCount = 10, distribution = null) {
  try {
    const difficultyPrompts = { easy:'生成簡單的基礎題目，適合初學者', medium:'生成中等難度題目，需要理解和應用', hard:'生成困難題目，需要深度分析和綜合運用' };
    const defaultDistribution = { multipleChoice:40, trueFalse:30, shortAnswer:30 };
    const dist = distribution || defaultDistribution;
    const counts = {
      multiple: Math.round(totalCount * dist.multipleChoice / 100),
      trueFalse: Math.round(totalCount * dist.trueFalse / 100),
      shortAnswer: Math.round(totalCount * dist.shortAnswer / 100)
    };
    const actualTotal = counts.multiple + counts.trueFalse + counts.shortAnswer;
    if (actualTotal !== totalCount) counts.multiple += (totalCount - actualTotal);

    // 更精準的佔位/低品質樣式集合：避免把正常解析句子誤判
    const placeholderPattern = new RegExp([
      '^干擾選項$',
      '干擾選項[一二三123]',
      '與教材不符(?:的說法)?',
      '^正確敘述$',
      '^選項[ABCD]$',
      '誤解[一二三1-3]',
      '自動補全',
      '概念不明',
      '隨意',
      '假設性敘述'
    ].join('|'), 'i');

    const isPlaceholder = (txt) => {
      if (!txt) return false;
      const t = String(txt).trim();
      if (!t) return false;
      // 短且僅有模板詞的才視為佔位；長句子僅含「正確敘述為…」不算
      if (t.length <= 20 && placeholderPattern.test(t)) return true;
      // 明顯的集合詞且無標點
      if (/干擾選項|自動補全|概念不明|假設性敘述/.test(t) && t.length < 40 && !/[。.!?；;]$/.test(t)) return true;
      return false;
    };

    const baseInstruction = `【題目品質規範 – 必須遵守】\nA. 嚴禁出現純佔位或模板字樣（如：干擾選項一 / 與教材不符 / 選項A 等單獨字樣）。\nB. 多選題 4 個選項：1 正確 + 3 具迷惑性但具體且明確錯誤或常見誤解；錯誤選項需與正確選項共享部分語境。\nC. 題幹多樣化（情境 / 反例 / 判斷 / 應用 / 排除），避免統一句型。\nD. explanation 必須：先闡述正確答案核心理由，再依序簡短說明 B/C/D 錯誤點（格式：B：…；C：…；D：…）。\nE. trueFalse 題：必須是可驗證陳述；避免『此敘述是否正確』式結尾。\nF. 簡答題：要求分析/比較/應用/舉例；答案 50~120 字，避免只列名詞。\nG. 僅輸出 JSON，無其他自然語言。`;

    const safeParseJSON = (text) => {
      if (!text) return null;
      let raw = text;
      try { return JSON.parse(raw); } catch(e) {}
      try {
        raw = raw.replace(/```json|```/gi,'').trim();
        // 取第一個 '{' 到最後一個 '}'
        const first = raw.indexOf('{');
        const last = raw.lastIndexOf('}');
        if (first !== -1 && last !== -1 && last > first) {
          const slice = raw.slice(first, last + 1);
          return JSON.parse(slice);
        }
      } catch(e) {}
      // 嘗試匹配 questions 陣列
      try {
        const match = raw.match(/"questions"\s*:\s*\[(.|\n|\r)*?\]/);
        if (match) {
          const obj = '{' + match[0] + '}';
          return JSON.parse(obj);
        }
      } catch(e) {}
      return null;
    };

    const attempt = async (refineContext = null) => {
      const refineNote = refineContext ? `\n【再生成修正原因】先前出現疑似模板/格式問題：${refineContext.slice(0,200)}。請重新完整生成，不得出現相同句子。` : '';
      const prompt = `基於下列教材內容與關鍵點，${difficultyPrompts[difficulty]} 產出共 ${totalCount} 題（多選 ${counts.multiple} / 真偽 ${counts.trueFalse} / 簡答 ${counts.shortAnswer}）：\n${refineNote}\n--- 教材內容 ---\n${content}\n--- keyPoints ---\n${JSON.stringify(keyPoints, null, 2)}\n${baseInstruction}\n輸出格式：{"questions":[{id,type,question,options?,answer,explanation,relatedConcepts[]}]} (合法 JSON)。`;
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
        contents: [ prompt ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: { type: Type.OBJECT, properties: { questions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id:{ type:Type.STRING }, type:{ type:Type.STRING, enum:['multiple','trueFalse','shortAnswer'] }, question:{ type:Type.STRING }, options:{ type:Type.ARRAY, items:{ type:Type.STRING } }, answer:{ type:Type.STRING }, explanation:{ type:Type.STRING }, relatedConcepts:{ type:Type.ARRAY, items:{ type:Type.STRING } } }, required:['type','question','answer','explanation'] } } }, required:['questions'] },
          thinkingConfig: { thinkingBudget: 0 }
        }
      });
      return safeParseJSON(response.text);
    };

    const maxRetries = 2;
    let result; let lastErr;
    for (let i=0;i<=maxRetries;i++) {
      try { result = await attempt(); if (result) break; }
      catch(e){ lastErr=e; if (!/UNAVAILABLE|503|timeout|unavailable/i.test(e.message) || i===maxRetries) break; await new Promise(r=>setTimeout(r, 600*Math.pow(2,i)+Math.random()*300)); }
    }

    const detectPlaceholders = (r) => !r || !Array.isArray(r.questions) || r.questions.some(q => {
      if (!q || !q.question) return true;
      if (q.type==='multiple') {
        if (!Array.isArray(q.options) || q.options.length!==4) return true;
        if (q.options.some(o=>isPlaceholder(o))) return true;
      }
      if (isPlaceholder(q.question) || isPlaceholder(q.explanation||'') || isPlaceholder(q.answer||'')) return true;
      return false;
    });

    if (result && detectPlaceholders(result)) {
      try {
        const badPieces = result.questions.filter(q=>q && q.options).slice(0,3).map(q => q.options.join('/')).join(' || ');
        let refined = await attempt(badPieces);
        if (refined && detectPlaceholders(refined)) {
          refined = await attempt('仍出現疑似模板/佔位詞，請改寫並提供多樣化語言');
        }
        if (!detectPlaceholders(refined)) result = refined; else console.log('精煉後仍有疑似佔位，進入本地修復');
      } catch(refErr) { console.log('精煉重試失敗，進入本地修復'); }
    }

    // ---------- 極限挽救解析（若有原始文本但 result 為空） ----------
    if (!result) {
      // 不馬上 fallback，再嘗試一次最小指令
      try {
        const minimal = await ai.models.generateContent({
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
            contents:[`只輸出 JSON：{"questions":[...]}，生成 ${totalCount} 題（多選${counts.multiple} 真偽${counts.trueFalse} 簡答${counts.shortAnswer}）。每題含 question, type, answer, explanation, options(若為 multiple)。教材片段：\n${content.slice(0,1200)}`],
          config:{ responseMimeType:'application/json', thinkingConfig:{ thinkingBudget:0 } }
        });
        result = safeParseJSON(minimal.text);
      } catch(e) { /* ignore */ }
    }

    // 若仍完全失敗 -> fallback（不顯示『降級』文案）
    if (!result || !Array.isArray(result.questions)) {
      const topics = keyPoints?.topics || []; const facts = keyPoints?.facts || [];
      const fb = []; const take = (arr,i,fallback)=> arr.length? arr[i%arr.length]: fallback;
      for (let i=0;i<counts.multiple;i++) { const stem = take(topics,i,`主題${i+1}`); const fact = (take(facts,i,stem)).slice(0,50); fb.push({ id:`fb_m_${i}`, type:'multiple', question:`關於「${stem}」下列何者最正確？`, options:[fact, `${stem} 的常見誤解敘述`, `${stem} 與無關概念混合的錯誤`, `將 ${stem} 因果倒置的說法`], answer:'A', explanation:`A 對應教材核心；其餘為誤解類型（泛化 / 混淆 / 錯誤因果）。`, relatedConcepts:[stem] }); }
      for (let i=0;i<counts.trueFalse;i++){ const txt = take(facts,i,take(topics,i,`敘述${i+1}`)); fb.push({ id:`fb_t_${i}`, type:'trueFalse', question:`「${txt}」此敘述是否為真？`, answer:'true', explanation:'可由教材原文佐證為真；若與原文矛盾則判為 false。', relatedConcepts:[txt] }); }
      for (let i=0;i<counts.shortAnswer;i++){ const stem = take(topics,i,take(facts,i,`概念${i+1}`)); fb.push({ id:`fb_s_${i}`, type:'shortAnswer', question:`說明「${stem}」核心意涵並舉一應用。`, answer:`請根據教材說明 ${stem} 的定義、特徵與應用。`, explanation:'參考方向：定義 + 關鍵機制/特徵 + 應用示例。', relatedConcepts:[stem] }); }
      result = { questions: fb, degraded:true };
    }

    // -------- 本地修復 / 強化後處理（保留原來邏輯） --------
    const topics = Array.isArray(keyPoints?.topics) ? keyPoints.topics : [];
    const facts = Array.isArray(keyPoints?.facts) ? keyPoints.facts : [];
    const conceptsArr = Array.isArray(keyPoints?.concepts) ? keyPoints.concepts : [];
    const conceptNames = conceptsArr.map(c => c?.name).filter(Boolean);
    const conceptDescMap = new Map(); conceptsArr.forEach(c=>conceptDescMap.set(c.name, c.description||''));
    const summary = typeof keyPoints?.summary === 'string' ? keyPoints.summary : '';
    const pick = (arr,i,fallback='') => (Array.isArray(arr)&&arr.length? arr[i%arr.length]: fallback);

    const buildDistractors = (base, pool) => {
      const uniq = Array.from(new Set(pool.filter(x=>x && x!==base))).slice(0,12);
      const out = [];
      const mutate = (s,mode) => {
        if (!s) return ''; let t=s;
        if (mode===0) t = t.replace(/是|為|可以/g,'可能');
        else if (mode===1) t = '將 ' + t.replace(/的/g,'') + ' 與其他概念混淆的說法';
        else if (mode===2) t = '錯誤地認為 ' + t + ' 可直接產生另一結果';
        return t.slice(0,60);
      };
      for (let i=0;i<3;i++) out.push(mutate(uniq[i]||base,i));
      return out.map((d,i)=> d || `常見誤解${i+1}`);
    };

    let repairedCount = 0;
    result.questions = (result.questions||[]).map((q,idx)=>{
      const type = q?.type || 'multiple';
      let question = (q?.question||'').trim();
      let options = Array.isArray(q?.options)? q.options.slice(0,4):[];
      let answer = (q?.answer||'').trim();
      let explanation = (q?.explanation||'').trim();
      let relatedConcepts = Array.isArray(q?.relatedConcepts)? q.relatedConcepts.filter(Boolean).slice(0,3):[];

      if (type==='multiple') {
        if (!question || isPlaceholder(question)) {
          question = `下列何者最能正確說明「${pick(topics,idx,'核心概念')}」？`;
          repairedCount++;
        }
        const baseConcept = pick(facts,idx,pick(topics,idx,'教材重點')).slice(0,70) || '教材重點概念';
        if (options.length!==4 || options.some(o=>isPlaceholder(o))) {
          const distractPool = facts.concat(topics).concat(conceptNames).filter(Boolean);
          const distractors = buildDistractors(baseConcept, distractPool);
          options = [baseConcept, ...distractors].slice(0,4);
          answer = 'A';
          repairedCount++;
        }
        if (!/^[ABCD]$/i.test(answer)) { answer='A'; repairedCount++; }
      } else if (type==='trueFalse') {
        if (!question || /是否正確$/.test(question) || isPlaceholder(question)) {
          const fact = pick(facts,idx,pick(topics,idx,'該概念要點'));
          question = `「${fact.slice(0,70)}」此敘述是否為真？`;
          repairedCount++;
        }
        if (!/^(true|false)$/i.test(answer)) { answer='true'; repairedCount++; }
      } else if (type==='shortAnswer') {
        if (!question) { const c = pick(conceptNames,idx,pick(topics,idx,'本章重點')); question = `說明「${c}」的核心原理並舉一應用情境。`; repairedCount++; }
        if (!answer || answer.length<20) {
          const c = pick(conceptNames,idx,'該概念');
          const desc = conceptDescMap.get(c)|| summary || '請根據教材內容作答。';
          answer = desc.slice(0,160);
          repairedCount++;
        }
      }

      if (!relatedConcepts.length) {
        const c1 = pick(conceptNames,idx,pick(topics,idx,''));
        if (c1) relatedConcepts=[c1];
      }

      const lowExp = !explanation || explanation.length<30 || isPlaceholder(explanation);
      if (lowExp) {
        if (type==='multiple') {
          const other = ['B','C','D'].map((k,i)=> `${k}：對應常見誤解類型${i+1}` ).join('；');
          explanation = `答案 ${answer || 'A'} 為教材核心表述；${other}（語意扭曲 / 混淆 / 錯誤因果）。`;
        } else if (type==='trueFalse') {
          explanation = `依教材原文或已知事實判定真偽；若與教材陳述一致則為 true，否則為 false。`;
        } else {
          explanation = `完整作答應涵蓋定義、機制/特徵與實際應用示例三部分。`;
        }
        repairedCount++;
      }

      return { id: q.id || `q_${Date.now()}_${idx}`, type, question, options: type==='multiple'? options: [], answer, explanation, relatedConcepts };
    });

    if (repairedCount>0) result.repaired = repairedCount;
    return result;
  } catch (error) {
    throw new Error(`題目生成失败: ${error.message}`);
  }
}

// 評估答案
async function evaluateAnswers(questions, userAnswers) {
  try {
    const results = [];
    let totalScore = 0;
    const weakAreas = [];

    // 簡答題評估 helper：含重試與 fallback
    const evaluateShortAnswer = async (question, userAnswerRaw) => {
      const userAnswer = (userAnswerRaw || '').toString().trim();
      const stdAnswer = (question.answer || '').toString().trim();
      const attempt = async () => {
        const evalResponse = await ai.models.generateContent({
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
          contents: [
            `請評估以下簡答題答案，僅回傳 JSON：\n\n題目：${question.question}\n標準答案：${stdAnswer}\n學生答案：${userAnswer}\n\n請給出：\n1. score (0-100)\n2. isCorrect (true/false)\n3. feedback (中文具體建議)\n\nJSON 格式：{ "score":數字, "isCorrect":布林, "feedback":"文字" }`
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: { type: Type.OBJECT, properties: { score:{ type:Type.INTEGER }, isCorrect:{ type:Type.BOOLEAN }, feedback:{ type:Type.STRING } } },
            thinkingConfig: { thinkingBudget: 0 }
          }
        });
        return JSON.parse(evalResponse.text);
      };
      const maxRetries = 2; let result; let lastErr;
      for (let i=0;i<=maxRetries;i++) {
        try { result = await attempt(); break; }
        catch(e){
          lastErr = e;
          if (!/UNAVAILABLE|503|timeout|unavailable/i.test(e.message) || i===maxRetries) break;
          const delay = 500 * Math.pow(2,i) + Math.random()*300;
            await new Promise(r=>setTimeout(r, delay));
        }
      }
      if (result && typeof result.score === 'number') return result; // 成功

      // Fallback 關鍵詞重疊評估
      const tokenRegex = /[A-Za-z0-9\u4e00-\u9fa5]+/g;
      const stdTokens = (stdAnswer.match(tokenRegex) || []).map(t=>t.toLowerCase());
      const userTokens = (userAnswer.match(tokenRegex) || []).map(t=>t.toLowerCase());
      const uniqStd = Array.from(new Set(stdTokens));
      const userSet = new Set(userTokens);
      let hit = 0; const missed = [];
      uniqStd.forEach(w=>{ if (userSet.has(w)) hit++; else missed.push(w); });
      const ratio = uniqStd.length? hit / uniqStd.length : 0;
      const score = Math.round(ratio * 100);
      const isCorrect = score >= 70; // 門檻可調整
      let feedback;
      if (!userAnswer) {
        feedback = '未提供答案，請根據教材內容回答關鍵要點。';
      } else if (isCorrect) {
        feedback = missed.length ? `整體答對度高，但可補充：${missed.slice(0,6).join('、')}` : '答案涵蓋主要要點。';
      } else {
        feedback = missed.length ? `尚未涵蓋主要要點：${missed.slice(0,6).join('、')}。建議重讀教材相關段落。` : '答案與標準重疊度低，建議重新整理概念。';
      }
      return { score, isCorrect, feedback, degraded: true };
    };

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const userAnswer = userAnswers[i];
      let isCorrect = false; let score = 0; let feedback = ''; let degraded = false;

      if (question.type === 'multiple' || question.type === 'trueFalse') {
        isCorrect = userAnswer && question.answer && userAnswer.toLowerCase().trim() === question.answer.toLowerCase().trim();
        score = isCorrect ? 100 : 0;
        feedback = isCorrect ? '答案正確！' : `答案錯誤。正確答案是：${question.answer}`;
      } else if (question.type === 'shortAnswer') {
        try {
          const evalRes = await evaluateShortAnswer(question, userAnswer);
          score = evalRes.score; isCorrect = !!evalRes.isCorrect; feedback = evalRes.feedback; degraded = evalRes.degraded;
        } catch(e) {
          // 最終兜底：完全失敗
          score = 0; isCorrect = false; feedback = '評估服務暫時不可用，請稍後再試。'; degraded = true;
        }
      }

      if (!isCorrect || score < 70) weakAreas.push(...(question.relatedConcepts || []));

      results.push({
        questionId: question.id,
        userAnswer,
        correctAnswer: question.answer,
        isCorrect,
        score,
        feedback,
        explanation: question.explanation,
        degraded
      });
      totalScore += score;
    }

    const averageScore = results.length? totalScore / results.length : 0;
    const recommendations = await generateRecommendations(averageScore, weakAreas);
    return { results, totalScore: Math.round(averageScore), weakAreas: [...new Set(weakAreas)], recommendations };
  } catch (error) {
    throw new Error(`答案評估失败: ${error.message}`);
  }
}

// 生成學習建議
async function generateRecommendations(score, weakAreas) {
  if (weakAreas.length === 0) return [];

  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
      contents: [
        `根據學生成績 ${score}% 和薄弱知識點，生成個性化學習建議：

        薄弱知識點：${weakAreas.join(', ')}

        請提供：
        1. 具體學習建議
        2. 推薦的學習資源
        3. 練習方向

        以JSON數組格式返回`
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              action: { type: Type.STRING }
            }
          }
        },
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    return [{ 
      type: 'general', 
      title: '繼續努力', 
      description: '建議重複練習相關題目',
      action: '複習教材相關章節'
    }];
  }
}

// 檢查教材錯誤
async function checkMaterialErrors(content) {
  try {
    console.log('開始錯誤檢查，內容長度:', content.length);
    
    // 如果內容太長，分塊處理
    const maxChunkSize = 15000; // 增加到15000字符
    const allErrors = [];
    let chunkIndex = 0;
    
    if (content.length > maxChunkSize) {
      console.log('內容較長，將分塊處理');
      const chunks = [];
      for (let i = 0; i < content.length; i += maxChunkSize) {
        chunks.push(content.substring(i, i + maxChunkSize));
      }
      
      for (const chunk of chunks) {
        console.log(`處理第 ${chunkIndex + 1}/${chunks.length} 塊，長度: ${chunk.length}`);
        try {
          const chunkResult = await processChunk(chunk, chunkIndex);
          if (chunkResult && chunkResult.errors) {
            allErrors.push(...chunkResult.errors);
          }
        } catch (chunkError) {
          console.error(`第 ${chunkIndex + 1} 塊處理失敗:`, chunkError.message);
          // 繼續處理下一塊，不中斷整個流程
        }
        chunkIndex++;
      }
      
      // 生成最終摘要
      const summary = generateErrorSummary(allErrors);
      
      return {
        errors: allErrors,
        summary: summary,
        processInfo: {
          totalChunks: chunks.length,
          processedChunks: chunkIndex,
          originalLength: content.length
        }
      };
    } else {
      // 內容不長，直接處理
      const result = await processChunk(content, 0);
      
      // 如果單塊處理沒有摘要，生成一個
      if (!result.summary) {
        result.summary = generateErrorSummary(result.errors || []);
      }
      
      return result;
    }
  } catch (error) {
    console.error('錯誤檢查失敗:', error.message);
    
    // 提供更詳細的錯誤信息
    if (error.message.includes('quota') || error.message.includes('limit')) {
      throw new Error('API請求限制，請稍後再試');
    } else if (error.message.includes('network') || error.message.includes('網路')) {
      throw new Error('網路連線問題，請檢查網路狀態');
    } else if (error.message.includes('JSON') || error.message.includes('parse')) {
      throw new Error('回應格式錯誤，請稍後再試');
    } else {
      throw new Error(`錯誤檢查失败: ${error.message}`);
    }
  }
}

// 處理單個內容塊
async function processChunk(content, chunkIndex) {
  console.log(`處理塊 ${chunkIndex + 1}`);
  
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    contents: [
      `請分析以下教材內容片段，找出可能的錯誤。

      教材內容片段 ${chunkIndex + 1}：
      ${content}
      
      請檢查以下類型的錯誤：
      1. 事實性錯誤 (factual_errors) - 錯誤的數據、日期、人名、地名等
      2. 邏輯錯誤 (logical_errors) - 推理不當、前後矛盾等
      3. 語法錯誤 (grammar_errors) - 語法、拼寫、標點符號錯誤
      4. 格式錯誤 (format_errors) - 格式不一致、結構問題等
      5. 概念錯誤 (conceptual_errors) - 概念理解或表達錯誤
      6. 引用錯誤 (citation_errors) - 引用格式錯誤或來源不明
      7. 空格錯誤 (spacing_errors) - 缺少必要空格、多餘空格、中英文間距問題、換行錯誤等
      
      **特別注意空格和換行問題：**
      - 仔細檢查文字間的空格是否正確，包括中英文之間、數字與文字之間的空格
      - 注意換行是否影響語義理解或閱讀流暢度
      - 如果空格或換行錯誤影響到語義理解，請歸類為 spacing_errors
      - 檢查段落分隔、句子間距、詞語連接等是否恰當
      
      請以結構化的JSON格式返回，每個錯誤包含：
      - 錯誤類型 (type)
      - 錯誤位置 (location) - 在原文中的大概位置描述（用中文描述）
      - 錯誤內容 (content) - 具體的錯誤文字（**保持原文語言**）
      - 錯誤描述 (description) - 錯誤的詳細說明（用中文）
      - 嚴重程度 (severity: 'high', 'medium', 'low')
      - 修正建議 (suggestion) - 修正說明用中文，但範例內容保持原文語言，格式：「說明... 例如：『原文範例』」
      - 信心度 (confidence: 0-100) - 確信這是錯誤的程度
      
      **重要提醒：**
      - 位置描述、錯誤描述用中文
      - 錯誤內容(content)和修正建議中的範例部分必須保持原文語言
      - 修正建議格式：「中文說明，例如：『原文修正範例』」
      - 特別留意空格和換行可能導致的語義問題`
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          errors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { 
                  type: Type.STRING,
                  enum: ['factual_errors', 'logical_errors', 'grammar_errors', 'format_errors', 'conceptual_errors', 'citation_errors', 'spacing_errors']
                },
                location: { type: Type.STRING },
                content: { type: Type.STRING },
                description: { type: Type.STRING },
                severity: { 
                  type: Type.STRING,
                  enum: ['high', 'medium', 'low']
                },
                suggestion: { type: Type.STRING },
                confidence: { type: Type.INTEGER }
              },
              required: ['type', 'location', 'content', 'description', 'severity', 'suggestion', 'confidence']
            }
          }
        },
        required: ['errors']
      },
      thinkingConfig: {
        thinkingBudget: 0
      }
    }
  });

  const result = JSON.parse(response.text);
  
  // 為每個錯誤添加唯一ID和塊信息
  if (result.errors) {
    result.errors.forEach((error, index) => {
      error.id = `error_${Date.now()}_${chunkIndex}_${index}`;
      error.chunkIndex = chunkIndex;
      
      // 確保所有必需字段都存在
      error.type = error.type || 'format_errors';
      error.location = error.location || '未指定位置';
      error.content = error.content || '內容不明';
      error.description = error.description || '描述不明';
      error.severity = error.severity || 'low';
      error.suggestion = error.suggestion || '建議進一步檢查';
      error.confidence = error.confidence || 50;
    });
  }

  console.log(`塊 ${chunkIndex + 1} 處理成功，找到 ${result.errors.length} 個錯誤`);
  return result;
}

// 清理 JSON 字符串
function cleanJsonString(jsonStr) {
  try {
    // 移除可能的 BOM 標記
    jsonStr = jsonStr.replace(/^\uFEFF/, '');
    
    // 移除多餘的空白字符
    jsonStr = jsonStr.trim();
    
    // 嘗試修復常見的 JSON 問題
    // 移除末尾多餘的逗號
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    
    // 修復未轉義的引號（簡單處理）
    jsonStr = jsonStr.replace(/([^\\])"([^"]*)"([^,}\]\s])/g, '$1\\"$2\\"$3');
    
    // 移除控制字符
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, '');
    
    return jsonStr;
  } catch (error) {
    console.error('JSON 清理失敗:', error.message);
    return jsonStr;
  }
}

// 生成錯誤摘要
function generateErrorSummary(errors) {
  const totalErrors = errors.length;
  const highSeverity = errors.filter(e => e.severity === 'high').length;
  const mediumSeverity = errors.filter(e => e.severity === 'medium').length;  
  const lowSeverity = errors.filter(e => e.severity === 'low').length;
  
  const avgConfidence = errors.length > 0 
    ? Math.round(errors.reduce((sum, e) => sum + (e.confidence || 0), 0) / errors.length)
    : 0;
  
  let assessment = '教材品質良好';
  if (highSeverity > 0) {
    assessment = '發現嚴重錯誤，建議仔細檢查';
  } else if (mediumSeverity > 3) {
    assessment = '發現多個中等錯誤，建議修正';
  } else if (totalErrors > 10) {
    assessment = '發現較多錯誤，建議整體檢查';
  }
  
  return {
    totalErrors,
    highSeverity,
    mediumSeverity,
    lowSeverity,
    averageConfidence: avgConfidence,
    overallAssessment: assessment
  };
}

// API 路由

// 上傳教材
app.post('/api/upload-material', upload.single('file'), async (req, res) => {
  try {
    console.log('收到上傳請求:', {
      hasFile: !!req.file,
      hasContent: !!req.body.content,
      fileInfo: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      } : null
    });

    if (!req.file && !req.body.content) {
      return res.status(400).json({ 
        error: '請提供文件或文本內容',
        success: false 
      });
    }

    let content;
    if (req.file) {
      console.log('開始解析文件:', req.file.path);
      content = await parseFile(req.file.path, req.file.mimetype);
      console.log('文件解析完成，內容長度:', content.length);
      
      // 清理上傳的文件
      await fs.unlink(req.file.path).catch((err) => {
        console.log('清理文件失敗:', err.message);
      });
    } else {
      content = req.body.content;
      console.log('使用文本內容，長度:', content.length);
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ 
        error: '文件內容為空或無法解析',
        success: false 
      });
    }

    console.log('開始提取關鍵知識點...');
    const keyPoints = await extractKeyPoints(content);
    console.log('關鍵知識點提取完成');

    res.json({
      success: true,
      data: {
        content,
        keyPoints,
        materialId: Date.now().toString()
      }
    });
  } catch (error) {
    console.error('上傳處理錯誤:', error);
    res.status(500).json({ 
      error: error.message,
      success: false,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 生成題目
app.post('/api/generate-questions', async (req, res) => {
  try {
    const { 
      content, 
      keyPoints, 
      difficulty = 'medium', 
      totalCount = 10,
      distribution 
    } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: '缺少教材內容' });
    }

    const questions = await generateQuestions(content, keyPoints, difficulty, totalCount, distribution);
    
    res.json({
      success: true,
      data: questions
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      success: false
    });
  }
});

// 提交答案
app.post('/api/submit-answers', async (req, res) => {
  try {
    const { questions, userAnswers } = req.body;
    
    if (!questions || !userAnswers) {
      return res.status(400).json({ error: '缺少題目或答案數據' });
    }

    const evaluation = await evaluateAnswers(questions, userAnswers);
    
    res.json({
      success: true,
      data: evaluation
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      success: false
    });
  }
});

// 檢查教材錯誤
app.post('/api/check-errors', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        error: '缺少教材內容',
        success: false 
      });
    }

    if (content.length < 10) {
      return res.status(400).json({ 
        error: '教材內容太短，無法進行有效檢查',
        success: false 
      });
    }

    console.log('開始錯誤檢查，內容長度:', content.length);
    
    // 設置請求超時處理
    const startTime = Date.now();
    const errorCheck = await checkMaterialErrors(content);
    const endTime = Date.now();
    
    console.log(`錯誤檢查完成，耗時: ${endTime - startTime}ms`);
    
    res.json({
      success: true,
      data: {
        ...errorCheck,
        processingTime: endTime - startTime,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('錯誤檢查API失敗:', error);
    
    // 根據不同錯誤類型返回適當的狀態碼和訊息
    let statusCode = 500;
    let errorMessage = error.message;
    
    if (error.message.includes('quota') || error.message.includes('limit')) {
      statusCode = 429; // Too Many Requests
      errorMessage = 'API請求限制，請稍後再試';
    } else if (error.message.includes('network') || error.message.includes('網路')) {
      statusCode = 503; // Service Unavailable
      errorMessage = '服務暫時不可用，請檢查網路連線';
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      success: false,
      errorType: error.name || 'UnknownError',
      timestamp: new Date().toISOString()
    });
  }
});

// 錯誤處理中間件
app.use((error, req, res, next) => {
  console.error('中間件錯誤處理:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: '文件大小超出限制 (10MB)',
        success: false,
        code: 'FILE_TOO_LARGE'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        error: '一次只能上傳一個文件',
        success: false,
        code: 'TOO_MANY_FILES'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        error: '未預期的文件字段',
        success: false,
        code: 'UNEXPECTED_FIELD'
      });
    }
    return res.status(400).json({ 
      error: `上傳錯誤: ${error.message}`,
      success: false,
      code: error.code
    });
  }
  
  if (error.message.includes('不支持的文件類型')) {
    return res.status(400).json({ 
      error: error.message,
      success: false,
      code: 'UNSUPPORTED_FILE_TYPE'
    });
  }
  
  res.status(500).json({ 
    error: error.message || '服務器內部錯誤',
    success: false,
    code: 'INTERNAL_ERROR'
  });
});

// 健康檢查端點
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.listen(PORT, HOST, () => {
  const externalHost = process.env.EXTERNAL_HOST || HOST;
  console.log(`服務器運行在 ${HOST}:${PORT}`);
  console.log(`本地訪問: http://localhost:${PORT}`);
  console.log(`外部訪問: http://${externalHost}:${PORT}`);
  console.log(`前端應該連接到: http://${externalHost}:${PORT}`);
});