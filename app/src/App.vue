<template>
  <div id="app">
    <header class="app-header glass">
      <div class="logo-block"><span class="logo">📘</span><h1>AI 教材練習與錯誤檢查系統</h1></div>
      <div class="mode-switch">
        <button :class="{ active: mode==='quiz' }" @click="switchMode('quiz')">🧠 測驗模式</button>
        <button :class="{ active: mode==='error' }" @click="switchMode('error')">🔍 錯誤檢查</button>
      </div>
    </header>

    <div v-if="mode==='quiz'" class="steps-bar">
      <div v-for="(s,i) in steps" :key="i" class="step" :class="{ active: quizStep===s.id, done: quizStep> s.id }">
        <div class="circle">{{ s.id }}</div>
        <div class="label">{{ s.label }}</div>
      </div>
    </div>

    <main class="app-body">
      <div v-if="mode==='quiz'" class="flow-wrapper">
        <transition name="fade" mode="out-in">
          <section :key="quizStep">
            <div v-show="quizStep===1"><upload-section :loading="loading.material" @material-loaded="handleMaterialLoaded" /></div>
            <div v-show="quizStep===2">
              <div class="section-header" v-if="materialData">
                <h2>📄 已載入教材 (長度: {{ materialLength }} 字)</h2>
                <button class="text-button" @click="resetMaterial">🗑 重新上傳</button>
              </div>
              <question-settings :loading="loading.generating" :initial-settings="questionSettings" @generate="generateQuestions" @settings-changed="updateSettings" />
            </div>
            <div v-show="quizStep===3">
              <quiz-section :questions="questions" :loading="loading.submitting" :initial-answers="userAnswers" @submit="submitAnswers" @back="quizStep=2" @answer-changed="onAnswerChanged" />
            </div>
            <div v-show="quizStep===4">
              <results-section :questions="questions" :evaluation="evaluation" @retry="retryQuiz" @regenerate="regenerate" @restart="restartAll" />
            </div>
          </section>
        </transition>
      </div>
      <div v-else class="flow-wrapper">
        <error-check-section />
      </div>
    </main>
  </div>
</template>

<script>
import axios from 'axios'
import UploadSection from './components/UploadSection.vue'
import QuestionSettings from './components/QuestionSettings.vue'
import QuizSection from './components/QuizSection.vue'
import ResultsSection from './components/ResultsSection.vue'
import ErrorCheckSection from './components/ErrorCheckSection.vue'
export default {
  name: 'App',
  components: { UploadSection, QuestionSettings, QuizSection, ResultsSection, ErrorCheckSection },
  data() { return { mode: 'quiz', quizStep: 1, materialData: null, questions: [], userAnswers: [], evaluation: null, loading: { material: false, generating: false, submitting: false }, questionSettings: { totalCount: 10, difficulty: 'medium', multipleChoice: 40, trueFalse: 30, shortAnswer: 30 }, steps:[ { id:1,label:'上傳教材' }, { id:2,label:'設定題目' }, { id:3,label:'作答測驗' }, { id:4,label:'檢視結果' } ] } },
  computed: { materialLength() { return this.materialData && this.materialData.content ? this.materialData.content.length : 0 } },
  methods: { switchMode(m) { if (this.mode === m) return; this.mode = m; if (m === 'quiz' && !this.materialData) this.quizStep = 1 }, async handleMaterialLoaded(payload) { this.materialData = payload; this.quizStep = 2 }, resetMaterial() { this.materialData = null; this.questions = []; this.userAnswers = []; this.evaluation = null; this.quizStep = 1 }, updateSettings(s) { this.questionSettings = { ...this.questionSettings, ...s } }, normalizeQuestion(q, index) { const safe = v => (typeof v === 'string' ? v.trim() : ''); let type = ['multiple','trueFalse','shortAnswer'].includes(q.type) ? q.type : 'multiple'; let question = safe(q.question) || `系統補全題目 ${index+1}`; let options = Array.isArray(q.options) ? q.options.filter(o=>o && o.toString().trim()) : []; if (type === 'multiple') { if (options.length < 4) { options = [ ...(options.slice(0,4)), '選項A自動補全','選項B自動補全','選項C自動補全','選項D自動補全' ].slice(0,4) } } else { options = [] } let answer = safe(q.answer) || (type==='trueFalse' ? 'true' : type==='multiple' ? 'A' : '參考教材'); if (type==='multiple' && !/^[ABCD]$/i.test(answer)) answer = 'A'; if (type==='trueFalse' && !/^(true|false)$/i.test(answer)) answer = 'true'; const explanation = safe(q.explanation) || '本題由系統補全，建議重新生成以獲得更準確敘述。'; const relatedConcepts = Array.isArray(q.relatedConcepts) && q.relatedConcepts.length>0 ? q.relatedConcepts : []; return { id: q.id || `q_${Date.now()}_${index}`, type, question, options, answer, explanation, relatedConcepts } }, validateQuestions(arr) { if (!Array.isArray(arr) || arr.length === 0) return []; return arr.map((q,i)=>this.normalizeQuestion(q,i)).filter(q=>q.question && q.type) }, async generateQuestions(settings) { if (!this.materialData) return; this.loading.generating = true; this.questions = []; this.userAnswers = []; this.evaluation = null; try { const distribution = { multipleChoice: settings.multipleChoice, trueFalse: settings.trueFalse, shortAnswer: settings.shortAnswer }; const res = await axios.post('/api/generate-questions', { content: this.materialData.content, keyPoints: this.materialData.keyPoints, difficulty: settings.difficulty, totalCount: settings.totalCount, distribution }); let raw = res.data?.data?.questions || []; const valid = this.validateQuestions(raw); if (valid.length === 0) { alert('生成的題目為空，請重試。'); return } this.questions = valid; this.userAnswers = new Array(valid.length).fill(''); this.quizStep = 3 } catch (err) { alert('生成題目失敗：' + (err.userMessage || err.message)) } finally { this.loading.generating = false } }, onAnswerChanged() {}, async submitAnswers(answers) { this.loading.submitting = true; try { const res = await axios.post('/api/submit-answers', { questions: this.questions, userAnswers: answers }); this.evaluation = res.data?.data || null; this.quizStep = 4 } catch (err) { alert('提交答案失敗：' + (err.userMessage || err.message)) } finally { this.loading.submitting = false } }, retryQuiz() { this.userAnswers = new Array(this.questions.length).fill(''); this.evaluation = null; this.quizStep = 3 }, regenerate() { this.evaluation = null; this.questions = []; this.userAnswers = []; this.quizStep = 2 }, restartAll() { this.resetMaterial() } }
}
</script>

<style>
* { box-sizing: border-box; }
body,html,#app { margin:0; padding:0; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans','PingFang TC','Microsoft JhengHei',sans-serif; background:linear-gradient(140deg,#f1f5f9,#eef2f7 35%,#e9f2fb); color:#1e2933; min-height:100vh; }
#app { max-width:1250px; margin:0 auto; padding:34px 34px 70px; }
.app-header { display:flex; flex-wrap:wrap; gap:26px; align-items:center; justify-content:space-between; margin-bottom:28px; border:1px solid rgba(255,255,255,.4); border-radius:18px; padding:18px 24px; position:relative; }
.app-header:before { content:""; position:absolute; inset:0; backdrop-filter:blur(12px); background:linear-gradient(100deg,rgba(255,255,255,.7),rgba(255,255,255,.35)); border-radius:inherit; z-index:0; }
.app-header > * { position:relative; z-index:1; }
.logo-block { display:flex; align-items:center; gap:14px; }
.logo { font-size:2rem; filter:drop-shadow(0 2px 4px rgba(0,0,0,.15)); }
.app-header h1 { font-size:1.4rem; margin:0; font-weight:600; letter-spacing:.5px; }
.mode-switch { display:flex; gap:14px; }
.mode-switch button { padding:10px 20px 11px; border:2px solid #1976d2; background:#fff; color:#1976d2; border-radius:12px; cursor:pointer; font-weight:600; font-size:.9rem; letter-spacing:.5px; box-shadow:0 2px 6px -2px rgba(25,118,210,.4); transition:.25s; }
.mode-switch button:hover { background:#e6f2fd; }
.mode-switch button.active { background:#1976d2; color:#fff; box-shadow:0 3px 10px -2px rgba(25,118,210,.55); }
.steps-bar { display:flex; gap:20px; margin:0 0 26px; padding:10px 18px; background:rgba(255,255,255,.6); border:1px solid #d9e2ec; border-radius:16px; box-shadow:0 4px 10px -2px rgba(0,0,0,.06); backdrop-filter:blur(8px); }
.step { display:flex; flex-direction:column; align-items:center; gap:6px; flex:1; position:relative; }
.step:after { content:""; position:absolute; top:22px; right:-10px; width:20px; height:2px; background:linear-gradient(90deg,#c8d4e0,#b3c1ce); }
.step:last-child:after { display:none; }
.circle { width:42px; height:42px; border-radius:50%; background:#fff; border:3px solid #c0d2e1; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.9rem; color:#506070; transition:.3s; box-shadow:0 2px 6px rgba(0,0,0,.05); }
.step.active .circle { border-color:#1976d2; background:#1976d2; color:#fff; box-shadow:0 4px 10px -2px rgba(25,118,210,.5); }
.step.done .circle { border-color:#329f6b; background:#38b273; color:#fff; }
.label { font-size:.7rem; font-weight:600; letter-spacing:.5px; color:#4b5c6d; text-transform:uppercase; }
.step.active .label { color:#1976d2; }
.step.done .label { color:#2f7d52; }
.app-body { display:block; }
.flow-wrapper { display:block; animation:fadeSlide .45s ease; }
.section-header { display:flex; align-items:center; justify-content:space-between; margin:0 0 16px; flex-wrap:wrap; gap:10px; }
.text-button { background:none; border:none; color:#d32f2f; font-weight:600; cursor:pointer; padding:6px 10px; border-radius:8px; line-height:1.1; font-size:.82rem; }
.text-button:hover { background:rgba(211,47,47,.08); }
.primary-button { background:#1976d2; color:#fff; border:none; padding:12px 22px; border-radius:10px; font-weight:600; cursor:pointer; box-shadow:0 3px 10px -2px rgba(25,118,210,.55); }
.primary-button:disabled { opacity:.6; cursor:not-allowed; box-shadow:none; }
.fade-enter-active,.fade-leave-active { transition:opacity .3s ease, transform .35s ease; }
.fade-enter-from,.fade-leave-to { opacity:0; transform:translateY(12px); }
@keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
</style>
