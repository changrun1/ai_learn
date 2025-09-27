<template>
  <div class="quiz-section">
    <div class="quiz-header">
      <h2>📝 開始答題</h2>
      <div class="progress-info" v-if="questions.length > 0">
        <span class="question-counter">題目 {{ currentQuestionIndex + 1 }} / {{ questions.length }}</span>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: ((currentQuestionIndex + 1) / questions.length) * 100 + '%' }"></div>
        </div>
      </div>
    </div>

    <div v-if="questions.length > 0" class="question-card">
      <div class="question-header">
        <span class="question-type-badge" :class="currentQuestion.type">
          {{ getQuestionTypeLabel(currentQuestion.type) }}
        </span>
      </div>

      <div class="question-content">
        <h3>{{ currentQuestion.question }}</h3>

        <!-- 多選題 -->
        <div v-if="currentQuestion.type === 'multiple'" class="options">
          <div
            v-for="(option, index) in currentQuestion.options"
            :key="index"
            class="option"
            :class="{ selected: userAnswers[currentQuestionIndex] === letter(index) }"
            @click="selectAnswer(letter(index))"
          >
            <div class="option-letter">{{ letter(index) }}</div>
            <div class="option-text">{{ option }}</div>
          </div>
        </div>

        <!-- 判斷題 -->
        <div v-else-if="currentQuestion.type === 'trueFalse'" class="true-false-options">
          <div class="tf-option" :class="{ selected: userAnswers[currentQuestionIndex] === 'true' }" @click="selectAnswer('true')">
            <div class="tf-icon">✅</div><span>正確</span>
          </div>
          <div class="tf-option" :class="{ selected: userAnswers[currentQuestionIndex] === 'false' }" @click="selectAnswer('false')">
            <div class="tf-icon">❌</div><span>錯誤</span>
          </div>
        </div>

        <!-- 簡答題 -->
        <div v-else-if="currentQuestion.type === 'shortAnswer'" class="short-answer">
          <textarea v-model="userAnswers[currentQuestionIndex]" placeholder="請輸入你的答案..." rows="4" class="answer-textarea"></textarea>
        </div>
      </div>

      <div class="question-navigation">
        <button class="nav-button" @click="previousQuestion" :disabled="currentQuestionIndex === 0">⬅️ 上一題</button>
        <button v-if="currentQuestionIndex < questions.length - 1" class="nav-button primary" @click="nextQuestion">下一題 ➡️</button>
        <button v-else class="nav-button primary" @click="submitAnswers" :disabled="loading">
          <span v-if="loading">⏳ 評估中...</span><span v-else>🎯 提交答案</span>
        </button>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>尚未取得題目或生成失敗，請返回題目設置重新生成。</p>
      <button class="nav-button" @click="$emit('back')">⬅️ 返回題目設置</button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'QuizSection',
  props: {
    questions: { type: Array, required: true },
    loading: { type: Boolean, default: false },
    initialAnswers: { type: Array, default: () => [] }
  },
  data() {
    return { currentQuestionIndex: 0, userAnswers: [...this.initialAnswers] }
  },
  computed: {
    currentQuestion() { return this.questions[this.currentQuestionIndex] || {} }
  },
  methods: {
    letter(i) { return String.fromCharCode(65 + i) },
    selectAnswer(answer) {
      this.$set(this.userAnswers, this.currentQuestionIndex, answer)
      this.$emit('answer-changed', { index: this.currentQuestionIndex, answer, allAnswers: this.userAnswers })
    },
    nextQuestion() { if (this.currentQuestionIndex < this.questions.length - 1) this.currentQuestionIndex++ },
    previousQuestion() { if (this.currentQuestionIndex > 0) this.currentQuestionIndex-- },
    submitAnswers() { this.$emit('submit', this.userAnswers) },
    getQuestionTypeLabel(type) { return { multiple: '多選題', trueFalse: '判斷題', shortAnswer: '簡答題' }[type] || type }
  },
  watch: {
    questions(newQ) { this.userAnswers = new Array(newQ.length).fill(''); this.currentQuestionIndex = 0 }
  }
}
</script>

<style scoped>
.quiz-header { margin-bottom: 30px; }
.progress-info { margin-top: 15px; }
.question-counter { font-weight: 600; color: #666; margin-bottom: 10px; display: block; }
.progress-bar { height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: #4caf50; transition: width 0.3s; }
.question-card { background: #f8f9fa; border-radius: 12px; padding: 30px; margin-bottom: 20px; }
.question-type-badge { display:inline-block; padding:6px 12px; border-radius:16px; font-size:.85rem; font-weight:600; margin-bottom:20px; }
.question-type-badge.multiple { background:#e8f5e8; color:#2e7d32; }
.question-type-badge.trueFalse { background:#fff3e0; color:#ef6c00; }
.question-type-badge.shortAnswer { background:#e3f2fd; color:#1565c0; }
.question-content h3 { font-size:1.2rem; margin-bottom:22px; line-height:1.5; color:#333; }
.options { display:flex; flex-direction:column; gap:12px; }
.option { display:flex; align-items:center; padding:15px; background:#fff; border:2px solid #e0e0e0; border-radius:8px; cursor:pointer; transition:.25s; }
.option:hover { border-color:#2196f3; background:#f0f8ff; }
.option.selected { border-color:#2196f3; background:#e3f2fd; }
.option-letter { width:32px; height:32px; border-radius:50%; background:#f5f5f5; display:flex; align-items:center; justify-content:center; font-weight:bold; margin-right:15px; color:#666; }
.option.selected .option-letter { background:#2196f3; color:#fff; }
.true-false-options { display:flex; gap:20px; justify-content:center; }
.tf-option { display:flex; flex-direction:column; align-items:center; padding:20px 30px; background:#fff; border:3px solid #e0e0e0; border-radius:12px; cursor:pointer; transition:.25s; min-width:120px; }
.tf-option:hover { border-color:#2196f3; background:#f0f8ff; }
.tf-option.selected { border-color:#2196f3; background:#e3f2fd; }
.tf-icon { font-size:2rem; margin-bottom:8px; }
.answer-textarea { width:100%; min-height:120px; padding:15px; border:2px solid #ddd; border-radius:8px; font-size:1rem; line-height:1.5; resize:vertical; font-family:inherit; }
.answer-textarea:focus { outline:none; border-color:#2196f3; }
.question-navigation { display:flex; justify-content:space-between; align-items:center; margin-top:30px; padding-top:20px; border-top:1px solid #e0e0e0; }
.nav-button { background:#f5f5f5; color:#333; border:2px solid #ddd; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; }
.nav-button.primary { background:#2196f3; color:#fff; border:none; }
.nav-button:disabled { opacity:.5; cursor:not-allowed; }
.empty-state { background:#fff; border:1px solid #eee; border-radius:8px; padding:24px; text-align:center; color:#666; }
</style>
