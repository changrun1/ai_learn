<template>
  <div class="results-section">
    <h2>📊 測驗結果</h2>

    <div v-if="evaluation" class="score-summary">
      <div class="score-main">總得分：<strong>{{ evaluation.totalScore }}%</strong></div>
      <div v-if="evaluation.weakAreas && evaluation.weakAreas.length" class="weak-areas">
        <strong>需加強知識點：</strong>
        <span class="tag" v-for="w in evaluation.weakAreas" :key="w">{{ w }}</span>
      </div>
    </div>

    <div class="question-results">
      <div class="question-item" v-for="(q,i) in questions" :key="q.id">
        <div class="q-header">
          <span class="badge" :class="q.type">{{ typeLabel(q.type) }}</span>
          <span class="index">第 {{ i+1 }} 題</span>
          <span class="status" :class="resultOf(q.id).isCorrect ? 'correct':'wrong'">
            {{ resultOf(q.id).isCorrect ? '✅ 正確' : '❌ 錯誤' }} ({{ resultOf(q.id).score }}分)
          </span>
        </div>
        <div class="q-body">
          <p class="question-text">{{ q.question }}</p>
          <ul v-if="q.type==='multiple'" class="options">
            <li v-for="(opt,idx) in q.options" :key="idx" :class="optionClass(q,idx)">
              <strong>{{ letter(idx) }}.</strong> {{ opt }}
            </li>
          </ul>
          <div v-else-if="q.type==='trueFalse'" class="tf-answer">正確答案：{{ q.answer==='true'?'正確':'錯誤' }}</div>
          <div v-else class="sa-answer">
            <p><strong>標準答案：</strong>{{ q.answer }}</p>
            <p><strong>你的答案：</strong>{{ answerOf(i) || '（未作答）' }}</p>
          </div>
          <div class="explanation">
            <strong>解析：</strong>{{ q.explanation }}
          </div>
          <div class="feedback" v-if="resultOf(q.id).feedback">
            <strong>AI 評語：</strong>{{ resultOf(q.id).feedback }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="evaluation && evaluation.recommendations && evaluation.recommendations.length" class="recommendations">
      <h3>📚 學習建議</h3>
      <div class="rec-item" v-for="(r,idx) in evaluation.recommendations" :key="idx">
        <h4>{{ r.title }}</h4>
        <p>{{ r.description }}</p>
        <p v-if="r.action" class="action">建議：{{ r.action }}</p>
      </div>
    </div>

    <div class="actions">
      <button class="primary-button" @click="$emit('retry')">再作一次</button>
      <button class="secondary-button" @click="$emit('regenerate')">重新出題</button>
      <button class="secondary-button" @click="$emit('restart')">重新開始</button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ResultsSection',
  props: { questions: Array, evaluation: Object },
  methods: {
    resultOf(id){ return this.evaluation?.results?.find(r=>r.questionId===id) || { isCorrect:false, score:0, feedback:'' } },
    answerOf(i){ return this.evaluation?.results?.[i]?.userAnswer },
    letter(i){ return String.fromCharCode(65+i) },
    typeLabel(t){ return { multiple:'多選', trueFalse:'判斷', shortAnswer:'簡答' }[t] || t },
    optionClass(q, idx){
      const letter = this.letter(idx)
      const res = this.resultOf(q.id)
      const isCorrect = q.answer === letter
      const user = (res.userAnswer || '').toUpperCase()
      return { option:true, correct:isCorrect, chosen:user===letter, wrong: user===letter && !isCorrect }
    }
  }
}
</script>

<style scoped>
.results-section { display:flex; flex-direction:column; gap:30px; }
.score-summary { background:#f1f8e9; padding:16px 20px; border-radius:8px; border-left:4px solid #4caf50; }
.score-main { font-size:1.2rem; font-weight:600; }
.weak-areas { margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; }
.tag { background:#e3f2fd; color:#1565c0; padding:4px 10px; border-radius:14px; font-size:.75rem; font-weight:600; }
.question-results { display:flex; flex-direction:column; gap:22px; }
.question-item { background:#fff; border:1px solid #e0e0e0; border-radius:10px; overflow:hidden; }
.q-header { display:flex; align-items:center; gap:12px; padding:12px 16px; background:#f7f7f7; flex-wrap:wrap; }
.badge { padding:4px 10px; border-radius:14px; font-size:.7rem; font-weight:600; background:#e0e0e0; }
.badge.multiple { background:#e8f5e8; color:#2e7d32; }
.badge.trueFalse { background:#fff3e0; color:#ef6c00; }
.badge.shortAnswer { background:#e3f2fd; color:#1565c0; }
.index { font-weight:600; }
.status { margin-left:auto; font-weight:600; }
.status.correct { color:#2e7d32; }
.status.wrong { color:#c62828; }
.q-body { padding:14px 20px 20px; display:flex; flex-direction:column; gap:10px; }
.question-text { margin:0 0 4px; font-weight:600; }
.options { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
.option { padding:8px 10px; border:1px solid #ddd; border-radius:6px; background:#fafafa; font-size:.9rem; }
.option.correct { border-color:#4caf50; background:#e8f5e9; }
.option.wrong { border-color:#d32f2f; background:#ffebee; }
.option.chosen:not(.correct):not(.wrong) { border-color:#1976d2; }
.explanation, .feedback { font-size:.85rem; line-height:1.5; background:#f9f9f9; padding:10px 12px; border-radius:6px; }
.feedback { background:#fff3e0; }
.recommendations { background:#f8f9fa; padding:18px 20px; border-radius:10px; border-left:4px solid #1976d2; display:flex; flex-direction:column; gap:16px; }
.rec-item h4 { margin:0 0 4px; font-size:1rem; }
.rec-item p { margin:0 0 4px; line-height:1.4; font-size:.85rem; }
.rec-item .action { color:#1976d2; font-weight:600; }
.actions { display:flex; gap:14px; }
.primary-button { background:#1976d2; color:#fff; border:none; padding:10px 20px; border-radius:8px; font-weight:600; cursor:pointer; }
.secondary-button { background:#f5f5f5; color:#333; border:2px solid #ddd; padding:10px 18px; border-radius:8px; cursor:pointer; font-weight:600; }
@media (max-width:700px){ .actions{ flex-direction:column; align-items:stretch; } }
</style>
