<template>
  <div class="question-settings">
    <h2>⚙️ 出題設置</h2>

    <!-- 基本設置 -->
    <div class="settings-grid">
      <div class="setting-item">
        <label>總題目數量：</label>
        <select v-model.number="localSettings.totalCount">
          <option v-for="n in totalCountOptions" :key="n" :value="n">{{ n }}題</option>
        </select>
      </div>
      <div class="setting-item">
        <label>難度等級：</label>
        <select v-model="localSettings.difficulty">
          <option value="easy">🟢 簡單</option>
            <option value="medium">🟡 中等</option>
          <option value="hard">🔴 困難</option>
        </select>
      </div>
    </div>

    <!-- 題型分配 -->
    <div class="question-distribution">
      <h3>📊 題型分配比例</h3>
      <div class="distribution-grid">
        <div class="distribution-item">
          <label>多選題比例：</label>
          <div class="slider-container">
            <input type="range" min="0" max="100" v-model.number="localSettings.multipleChoice" @input="rebalance('multipleChoice')"/>
            <span class="percentage">{{ localSettings.multipleChoice }}%</span>
          </div>
        </div>
        <div class="distribution-item">
          <label>判斷題比例：</label>
          <div class="slider-container">
            <input type="range" min="0" max="100" v-model.number="localSettings.trueFalse" @input="rebalance('trueFalse')"/>
            <span class="percentage">{{ localSettings.trueFalse }}%</span>
          </div>
        </div>
        <div class="distribution-item">
          <label>簡答題比例：</label>
          <div class="slider-container">
            <input type="range" min="0" max="100" v-model.number="localSettings.shortAnswer" @input="rebalance('shortAnswer')"/>
            <span class="percentage">{{ localSettings.shortAnswer }}%</span>
          </div>
        </div>
      </div>

      <div class="distribution-summary" :class="{ error: percentageOutOfRange }">
        <div class="summary-item">
          <strong>總計: {{ totalPercentage }}%</strong>
          <span v-if="percentageOutOfRange" class="error-text">(建議調整至 95% - 105% 之間，系統會自動微調)</span>
          <span v-else class="ok-text">(正常)</span>
        </div>
        <div class="question-count-preview">
          <h4>預計題目數量：</h4>
          <ul>
            <li>多選題：約 {{ estimatedCounts.multiple }} 題</li>
            <li>判斷題：約 {{ estimatedCounts.trueFalse }} 題</li>
            <li>簡答題：約 {{ estimatedCounts.shortAnswer }} 題</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 生成按鈕 -->
    <button class="primary-button" :disabled="loading || noContent" @click="handleGenerate">
      <span v-if="loading">⏳ 生成中...</span>
      <span v-else>✨ 生成題目</span>
    </button>
    <p v-if="noContent" class="helper-text">請先上傳教材內容再生成題目。</p>
  </div>
</template>

<script>
export default {
  name: 'QuestionSettings',
  props: {
    loading: { type: Boolean, default: false },
    initialSettings: {
      type: Object,
      default: () => ({ totalCount: 10, difficulty: 'medium', multipleChoice: 40, trueFalse: 30, shortAnswer: 30 })
    }
  },
  data() {
    return {
      localSettings: { ...this.initialSettings },
      totalCountOptions: [5, 10, 15, 20]
    }
  },
  computed: {
    totalPercentage() {
      return (this.localSettings.multipleChoice || 0) + (this.localSettings.trueFalse || 0) + (this.localSettings.shortAnswer || 0)
    },
    percentageOutOfRange() { return Math.abs(this.totalPercentage - 100) > 5 },
    estimatedCounts() {
      const total = this.localSettings.totalCount || 0
      const mc = Math.round(total * (this.localSettings.multipleChoice / 100))
      const tf = Math.round(total * (this.localSettings.trueFalse / 100))
      let sa = Math.round(total * (this.localSettings.shortAnswer / 100))
      let sum = mc + tf + sa
      if (sum !== total) sa += (total - sum)
      return { multiple: mc, trueFalse: tf, shortAnswer: sa }
    },
    noContent() {
      // 透過事件讓父層傳入是否已有教材（父層可改為直接傳教材狀態 prop）
      return !this.$root.$children?.[0]?.materialData
    }
  },
  methods: {
    rebalance(changed) {
      // 確保數值為整數
      ['multipleChoice','trueFalse','shortAnswer'].forEach(k => {
        if (this.localSettings[k] == null || isNaN(this.localSettings[k])) this.localSettings[k] = 0
        this.localSettings[k] = Math.min(100, Math.max(0, parseInt(this.localSettings[k])))
      })
      const total = this.totalPercentage
      if (total === 100) { this.emitSettings(); return }
      // 超過或小於100時按比例縮放另外兩個
      const others = ['multipleChoice','trueFalse','shortAnswer'].filter(k => k !== changed)
      const remain = 100 - this.localSettings[changed]
      if (remain < 0) {
        // 直接把其他兩個設為0
        others.forEach(k => { this.localSettings[k] = 0 })
      } else {
        const avg = Math.floor(remain / 2)
        this.localSettings[others[0]] = avg
        this.localSettings[others[1]] = remain - avg
      }
      this.emitSettings()
    },
    emitSettings() {
      this.$emit('settings-changed', { ...this.localSettings })
    },
    handleGenerate() {
      this.emitSettings()
      this.$emit('generate', { ...this.localSettings })
    }
  },
  watch: {
    localSettings: {
      deep: true,
      handler() { this.emitSettings() }
    }
  }
}
</script>

<style scoped>
.question-settings h2 { color: #333; margin-bottom: 20px; }
.settings-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); gap: 20px; margin-bottom: 25px; }
.setting-item { display: flex; flex-direction: column; gap: 6px; }
.setting-item label { font-weight: 600; color: #333; }
.setting-item select { padding: 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 1rem; background: #fff; }

.question-distribution h3 { margin-bottom: 15px; color: #333; }
.distribution-grid { display: grid; gap: 18px; }
.distribution-item label { font-weight: 600; color: #333; display: block; margin-bottom: 6px; }
.slider-container { display: flex; align-items: center; gap: 12px; }
.slider-container input[type=range] { flex: 1; }
.percentage { width: 48px; font-weight: 600; text-align: right; color: #555; }

.distribution-summary { display: flex; gap: 40px; margin-top: 25px; flex-wrap: wrap; }
.distribution-summary.error strong { color: #d32f2f; }
.summary-item strong { font-size: 1rem; }
.error-text { color: #d32f2f; font-size: 0.85rem; margin-left: 8px; }
.ok-text { color: #388e3c; font-size: 0.85rem; margin-left: 8px; }
.question-count-preview h4 { margin-bottom: 8px; font-size: 1rem; color: #333; }
.question-count-preview ul { list-style: none; padding: 0; margin: 0; }
.question-count-preview li { font-size: 0.9rem; color: #555; line-height: 1.4; }

.primary-button { margin-top: 25px; }
.helper-text { margin-top: 8px; font-size: 0.85rem; color: #d32f2f; }
</style>
