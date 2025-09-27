<template>
  <div class="error-check-section fancy-card">
    <div class="head">
      <div class="title-block"><span class="icon">🔍</span><div><h2>教材錯誤檢查</h2><p class="sub">上傳教材並偵測常見結構 / 概念 / 空格與格式問題</p></div></div>
    </div>

    <div class="file-area" :class="{ uploading: loading, hasFile: !!selectedFile }">
      <input class="file-input" type="file" @change="onFileChange" accept=".txt,.pdf,.docx" />
      <div class="placeholder" v-if="!selectedFile">
        <p class="main-hint">點擊或拖曳教材檔案到此區</p>
        <p class="hint">支援 TXT / PDF / DOCX（≤10MB）</p>
      </div>
      <div v-else class="file-info">
        <div class="file-name">{{ fileName }}</div>
        <div class="status" v-if="loading">⏳ 正在解析與檢查...</div>
      </div>
    </div>

    <div class="action-bar">
      <button class="primary-button" :disabled="!selectedFile || loading" @click="processFile">{{ loading? '⏳ 處理中...' : '🚀 解析並檢查錯誤' }}</button>
      <button v-if="selectedFile && !loading" class="ghost-button" @click="reset">重新選擇</button>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div v-if="result" class="result-wrapper">
      <div class="summary-grid">
        <div class="summary-card">
          <h3>總錯誤</h3>
          <div class="val main">{{ result.summary.totalErrors }}</div>
        </div>
        <div class="summary-card sev high">
          <h3>嚴重</h3>
            <div class="val">{{ result.summary.highSeverity }}</div>
        </div>
        <div class="summary-card sev medium">
          <h3>中等</h3>
            <div class="val">{{ result.summary.mediumSeverity }}</div>
        </div>
        <div class="summary-card sev low">
          <h3>輕微</h3>
            <div class="val">{{ result.summary.lowSeverity }}</div>
        </div>
        <div class="summary-card">
          <h3>平均信心</h3>
          <div class="val">{{ result.summary.averageConfidence }}%</div>
        </div>
        <div class="summary-card span2 assess">
          <h3>整體評估</h3>
          <div class="assessment">{{ result.summary.overallAssessment }}</div>
        </div>
      </div>

      <div class="filter-bar" v-if="errors.length > 0">
        <label>篩選類型</label>
        <select v-model="activeFilter">
          <option value="all">全部</option>
          <option v-for="t in errorTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <div class="count" v-if="activeFilter!=='all'">{{ filteredErrors.length }} / {{ errors.length }}</div>
      </div>

      <div class="error-list" v-if="filteredErrors.length > 0">
        <div class="error-item" v-for="(err, i) in filteredErrors" :key="err.id || i">
          <div class="row top">
            <span class="badge type">{{ getTypeLabel(err.type) }}</span>
            <span class="badge severity" :class="err.severity">{{ severityLabel(err.severity) }}</span>
            <span class="badge confidence">信心 {{ err.confidence ?? 0 }}%</span>
          </div>
          <div class="body">
            <p class="loc"><strong>位置</strong>{{ err.location }}</p>
            <p class="frag"><strong>錯誤</strong><span class="content-frag">{{ err.content }}</span></p>
            <p class="desc"><strong>描述</strong>{{ err.description }}</p>
            <p class="suggest"><strong>建議</strong>{{ err.suggestion }}</p>
          </div>
        </div>
      </div>
      <div v-else class="empty">目前沒有符合篩選的錯誤。</div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'
export default {
  name: 'ErrorCheckSection',
  data() { return { loading:false, fileName:'', errorMsg:'', selectedFile:null, content:'', result:null, activeFilter:'all', errorTypes:[
    { value: 'factual_errors', label: '事實錯誤' },
    { value: 'logical_errors', label: '邏輯錯誤' },
    { value: 'grammar_errors', label: '語法錯誤' },
    { value: 'format_errors', label: '格式錯誤' },
    { value: 'conceptual_errors', label: '概念錯誤' },
    { value: 'citation_errors', label: '引用錯誤' },
    { value: 'spacing_errors', label: '空格錯誤' }
  ] } },
  computed: { errors() { return this.result?.errors || [] }, filteredErrors(){ return this.activeFilter==='all'? this.errors : this.errors.filter(e=>e.type===this.activeFilter) } },
  methods: {
    reset(){ this.fileName=''; this.selectedFile=null; this.errorMsg=''; this.result=null },
    onFileChange(e){ const f=e.target.files?.[0]; if(!f){ this.selectedFile=null; this.fileName=''; return } this.selectedFile=f; this.fileName=f.name; this.errorMsg=''; },
    async processFile(){ if(!this.selectedFile) return; this.loading=true; this.errorMsg=''; this.result=null; try { const form = new FormData(); form.append('file', this.selectedFile); const up = await axios.post('/api/upload-material', form); this.content = up.data?.data?.content || ''; const chk = await axios.post('/api/check-errors', { content: this.content }); this.result = chk.data?.data || null; } catch(err){ this.errorMsg='處理失敗：' + (err.userMessage || err.message) } finally { this.loading=false } },
    getTypeLabel(v){ const f = this.errorTypes.find(t=>t.value===v); return f?f.label:v },
    severityLabel(s){ return { high:'嚴重', medium:'中等', low:'輕微' }[s] || s }
  }
}
</script>

<style scoped>
.error-check-section { display:flex; flex-direction:column; gap:26px; }
.fancy-card { background:#fff; border:1px solid #e2e8f0; border-radius:20px; padding:30px 32px 40px; box-shadow:0 4px 14px -2px rgba(0,0,0,.06),0 2px 4px rgba(0,0,0,.04); position:relative; }
.fancy-card:before { content:""; position:absolute; inset:0; background:linear-gradient(135deg,rgba(25,118,210,.06),rgba(25,118,210,0)); pointer-events:none; }
.head { display:flex; justify-content:space-between; align-items:flex-start; }
.title-block { display:flex; gap:14px; align-items:center; }
.title-block h2 { margin:0 0 4px; font-size:1.3rem; letter-spacing:.5px; }
.sub { margin:0; font-size:.78rem; color:#60738a; font-weight:500; }
.icon { font-size:1.7rem; }
.file-area { position:relative; border:2px dashed #b9c4d1; border-radius:16px; min-height:150px; display:flex; align-items:center; justify-content:center; background:#f5f8fb; transition:.3s; padding:20px; }
.file-area:hover { border-color:#1976d2; background:#f0f6fc; }
.file-area.hasFile { border-style:solid; border-color:#1976d2; background:#eef6ff; }
.file-area.uploading { opacity:.6; }
.file-input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
.placeholder { text-align:center; }
.main-hint { margin:0 0 6px; font-weight:600; color:#2c3e50; }
.hint { margin:0; font-size:.72rem; color:#6e7b88; }
.file-info { display:flex; flex-direction:column; gap:6px; align-items:center; }
.file-name { background:#fff; padding:10px 16px; border-radius:12px; font-size:.85rem; font-weight:600; color:#1a2b3c; border:1px solid #d6dee6; max-width:100%; word-break:break-all; box-shadow:0 2px 4px rgba(0,0,0,.04); }
.status { font-size:.75rem; color:#1976d2; font-weight:600; letter-spacing:.5px; }
.action-bar { display:flex; gap:14px; flex-wrap:wrap; margin-top:6px; }
.primary-button { background:#1976d2; color:#fff; border:none; padding:12px 26px; border-radius:10px; font-weight:600; cursor:pointer; font-size:.95rem; letter-spacing:.5px; box-shadow:0 3px 8px -2px rgba(25,118,210,.4); transition:.25s; }
.primary-button:hover:not(:disabled) { background:#145fa5; }
.primary-button:disabled { opacity:.55; cursor:not-allowed; box-shadow:none; }
.ghost-button { background:#fff; color:#374151; border:2px solid #d0d8e1; padding:11px 22px; border-radius:10px; font-weight:600; cursor:pointer; font-size:.9rem; transition:.25s; }
.ghost-button:hover { border-color:#1976d2; color:#1976d2; }
.error-msg { margin:2px 2px 0; font-size:.75rem; color:#d32f2f; font-weight:600; }
.result-wrapper { display:flex; flex-direction:column; gap:34px; margin-top:8px; }
.summary-grid { display:grid; gap:18px; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); }
.summary-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:14px 16px 18px; position:relative; overflow:hidden; }
.summary-card:before { content:""; position:absolute; inset:0; background:linear-gradient(160deg,rgba(255,255,255,.6),rgba(255,255,255,0)); pointer-events:none; }
.summary-card h3 { margin:0 0 8px; font-size:.76rem; font-weight:700; letter-spacing:.5px; text-transform:uppercase; color:#5a6b7c; }
.summary-card .val { font-size:1.4rem; font-weight:700; color:#1b2735; letter-spacing:1px; }
.summary-card.main { background:#1976d2; color:#fff; }
.summary-card.sev.high { background:#ffe5e8; border-color:#ffcdd2; }
.summary-card.sev.medium { background:#fff3e0; border-color:#ffe0b2; }
.summary-card.sev.low { background:#f1f8e9; border-color:#dcedc8; }
.summary-card.assess .assessment { font-size:.85rem; line-height:1.4; color:#203040; font-weight:600; }
.summary-card.span2 { grid-column:span 2; }
@media (max-width:620px){ .summary-card.span2 { grid-column:span 1; } }
.filter-bar { display:flex; gap:12px; align-items:center; background:#fff; padding:10px 14px; border:1px solid #e2e8f0; border-radius:12px; box-shadow:0 2px 4px rgba(0,0,0,.04); }
.filter-bar label { font-size:.8rem; font-weight:600; color:#374151; }
.filter-bar select { padding:6px 10px; border:1px solid #c0c7ce; border-radius:8px; background:#f8fafc; font-size:.8rem; }
.filter-bar .count { font-size:.7rem; background:#eef2f5; padding:4px 8px; border-radius:10px; font-weight:600; letter-spacing:.5px; }
.error-list { display:flex; flex-direction:column; gap:18px; }
.error-item { background:#fff; border:1px solid #e2e8f0; border-radius:18px; padding:18px 20px 20px; box-shadow:0 2px 6px -1px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.04); display:flex; flex-direction:column; gap:10px; }
.row.top { display:flex; flex-wrap:wrap; gap:10px; }
.badge { display:inline-block; padding:5px 12px 6px; border-radius:18px; font-size:.68rem; font-weight:700; letter-spacing:.5px; text-transform:uppercase; background:#e3f2fd; color:#1565c0; }
.badge.severity.high { background:#ffcdd2; color:#b71c1c; }
.badge.severity.medium { background:#ffe0b2; color:#e65100; }
.badge.severity.low { background:#dcedc8; color:#2e7d32; }
.badge.confidence { background:#f1f5f9; color:#475569; }
.body p { margin:4px 0; font-size:.78rem; line-height:1.45; display:flex; gap:6px; }
.body p strong { font-size:.68rem; background:#eef2f5; padding:4px 6px; border-radius:6px; letter-spacing:.5px; color:#324350; font-weight:700; min-width:40px; text-align:center; }
.content-frag { background:#fff8d1; padding:2px 5px; border-radius:6px; font-family:monospace; font-size:.7rem; }
.empty { text-align:center; color:#546575; font-size:.8rem; font-weight:600; letter-spacing:.5px; }
</style>
