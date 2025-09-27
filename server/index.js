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
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
      contents: [
        `請分析以下教材內容，提取關鍵知識點：
        
        教材內容：
        ${content}
        
        請以結構化的JSON格式返回，包含：
        1. 主要主題 (topics)
        2. 重要概念 (concepts) 
        3. 關鍵事實 (facts)
        4. 教材摘要 (summary)`
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topics: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            concepts: {
              type: Type.ARRAY,
              items: { 
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              }
            },
            facts: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            summary: { type: Type.STRING }
          }
        },
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    throw new Error(`知識點提取失败: ${error.message}`);
  }
}

// 生成題目
async function generateQuestions(content, keyPoints, difficulty = 'medium', totalCount = 10, distribution = null) {
  try {
    const difficultyPrompts = {
      easy: '生成簡單的基礎題目，適合初學者',
      medium: '生成中等難度題目，需要理解和應用',
      hard: '生成困難題目，需要深度分析和綜合運用'
    };

    // 預設題型分配
    const defaultDistribution = {
      multipleChoice: 40,
      trueFalse: 30,
      shortAnswer: 30
    };

    const dist = distribution || defaultDistribution;
    
    // 計算各題型數量
    const counts = {
      multiple: Math.round(totalCount * dist.multipleChoice / 100),
      trueFalse: Math.round(totalCount * dist.trueFalse / 100),
      shortAnswer: Math.round(totalCount * dist.shortAnswer / 100)
    };

    // 確保總數量正確
    const actualTotal = counts.multiple + counts.trueFalse + counts.shortAnswer;
    if (actualTotal !== totalCount) {
      const diff = totalCount - actualTotal;
      counts.multiple += diff; // 將差值加到多選題上
    }

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
      contents: [
        `基於以下教材內容和關鍵知識點，${difficultyPrompts[difficulty]}，生成${totalCount}道題目：

        教材內容：
        ${content}

        關鍵知識點：
        ${JSON.stringify(keyPoints, null, 2)}

        請按照以下題型數量分配生成題目：
        - 多選題：${counts.multiple}道
        - 真/假題：${counts.trueFalse}道  
        - 簡答題：${counts.shortAnswer}道

        返回JSON格式，每道題目包含：
        - 題目類型 (type: 'multiple', 'trueFalse', 'shortAnswer')
        - 題目內容 (question)
        - 選項 (options，僅多選題需要)
        - 正確答案 (answer)
        - 解釋說明 (explanation)
        - 相關知識點 (relatedConcepts)

        注意：
        1. 嚴格按照指定的題型數量分配
        2. 多選題提供4個選項，標註正確答案(A/B/C/D)
        3. 真假題答案為 'true' 或 'false'
        4. 簡答題提供詳細的標準答案`
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { 
                    type: Type.STRING,
                    enum: ['multiple', 'trueFalse', 'shortAnswer']
                  },
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  answer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  relatedConcepts: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                }
              }
            }
          }
        },
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    });

    const result = JSON.parse(response.text);
    
    // 後端補全與正規化：若模型回傳題目缺欄位，使用 keyPoints/summary 自動補齊，避免前端無法顯示
    const topics = Array.isArray(keyPoints?.topics) ? keyPoints.topics : [];
    const conceptsArr = Array.isArray(keyPoints?.concepts) ? keyPoints.concepts : [];
    const conceptNames = conceptsArr.map(c => c?.name).filter(Boolean);
    const conceptDescMap = new Map();
    conceptsArr.forEach(c => conceptDescMap.set(c?.name, c?.description || ''));
    const facts = Array.isArray(keyPoints?.facts) ? keyPoints.facts : [];
    const summary = typeof keyPoints?.summary === 'string' ? keyPoints.summary : '';
    const pick = (arr, i, fallback = '') => (Array.isArray(arr) && arr.length > 0 ? arr[i % arr.length] : fallback);

    result.questions = (Array.isArray(result.questions) ? result.questions : []).map((q, index) => {
      const nowId = `q_${Date.now()}_${index}`;
      const type = q?.type || 'multiple';
      let question = q?.question;
      let options = Array.isArray(q?.options) ? q.options : [];
      let answer = q?.answer;
      let explanation = q?.explanation || '';
      let relatedConcepts = Array.isArray(q?.relatedConcepts) ? q.relatedConcepts : [];

      if (type === 'multiple') {
        if (!question) {
          const topic = pick(topics, index, '本章主題');
          question = `關於「${topic}」，以下哪一項敘述較為恰當？（系統自動補全）`;
        }
        if (options.length < 4) {
          const base = pick(facts, index, '依教材可知的正確敘述');
          options = [String(base), '與教材不符的敘述 A', '與教材不符的敘述 B', '與教材不符的敘述 C'];
        }
        if (!answer || typeof answer !== 'string') {
          answer = 'A';
        }
      } else if (type === 'trueFalse') {
        if (!question) {
          const fact = pick(facts, index, pick(topics, index, '此敘述'));
          question = `「${fact}」此敘述是否正確？（系統自動補全）`;
        }
        if (!answer || typeof answer !== 'string') {
          answer = 'true';
        }
      } else if (type === 'shortAnswer') {
        if (!question) {
          const cname = pick(conceptNames, index, pick(topics, index, '本章重點'));
          question = `請簡述「${cname}」的重點。（系統自動補全）`;
        }
        if (!answer || typeof answer !== 'string' || answer.trim() === '') {
          const cname = pick(conceptNames, index, '');
          const desc = cname ? (conceptDescMap.get(cname) || '') : '';
          answer = (desc || summary || '請根據教材內容作答。').toString().slice(0, 300);
        }
      }

      if (!explanation) {
        explanation = '本題內容由系統自動補全，建議重新生成題目以獲得更精確的敘述。';
      }
      if (relatedConcepts.length === 0 && conceptNames.length > 0) {
        relatedConcepts = [pick(conceptNames, index)];
      }

      return {
        id: q?.id || nowId,
        type,
        question,
        options,
        answer,
        explanation,
        relatedConcepts
      };
    });
    
    // 為每個題目添加唯一ID（若缺失）
    result.questions.forEach((question, index) => {
      question.id = question.id || `q_${Date.now()}_${index}`;
    });

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

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const userAnswer = userAnswers[i];
      
      let isCorrect = false;
      let score = 0;
      let feedback = '';

      if (question.type === 'multiple' || question.type === 'trueFalse') {
        console.log(`問題 ${i + 1}:`);
        console.log(`用戶答案: "${userAnswer}"`);
        console.log(`正確答案: "${question.answer}"`);
        console.log(`用戶答案(小寫): "${userAnswer?.toLowerCase()}"`);
        console.log(`正確答案(小寫): "${question.answer?.toLowerCase()}"`);
        
        isCorrect = userAnswer && question.answer && 
                   userAnswer.toLowerCase().trim() === question.answer.toLowerCase().trim();
        score = isCorrect ? 100 : 0;
        feedback = isCorrect ? '答案正確！' : `答案錯誤。正確答案是：${question.answer}`;
        
        console.log(`是否正確: ${isCorrect}`);
        console.log('---');
      } else if (question.type === 'shortAnswer') {
        // 使用 AI 評估簡答題
        const evalResponse = await ai.models.generateContent({
          model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
          contents: [
            `請評估以下簡答題的答案：

            題目：${question.question}
            標準答案：${question.answer}
            學生答案：${userAnswer}

            請給出：
            1. 分數 (0-100)
            2. 是否正確 (true/false)
            3. 具體反饋

            以JSON格式返回`
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER },
                isCorrect: { type: Type.BOOLEAN },
                feedback: { type: Type.STRING }
              }
            },
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        });

        const evalResult = JSON.parse(evalResponse.text);
        score = evalResult.score;
        isCorrect = evalResult.isCorrect;
        feedback = evalResult.feedback;
      }

      if (!isCorrect || score < 70) {
        weakAreas.push(...question.relatedConcepts);
      }

      results.push({
        questionId: question.id,
        userAnswer,
        correctAnswer: question.answer,
        isCorrect,
        score,
        feedback,
        explanation: question.explanation
      });

      totalScore += score;
    }

    const averageScore = totalScore / questions.length;
    
    // 生成學習建議
    const recommendations = await generateRecommendations(averageScore, weakAreas);

    return {
      results,
      totalScore: Math.round(averageScore),
      weakAreas: [...new Set(weakAreas)],
      recommendations
    };
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