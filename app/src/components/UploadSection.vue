<template>
  <div class="upload-section fancy-card">
    <div class="card-header">
      <div class="title-block">
        <span class="icon">📤</span>
        <div>
          <h2>上傳教材文件</h2>
          <p class="sub">支援 TXT / PDF / DOCX（≤10MB）</p>
        </div>
      </div>
    </div>

    <div class="file-area" :class="{ uploading: localLoading, hasFile: !!selectedFile }">
      <input class="file-input" type="file" @change="onFileChange" accept=".txt,.pdf,.docx" />
      <div class="placeholder" v-if="!selectedFile">
        <p class="main-hint">點擊或拖曳檔案到此區</p>
        <p class="hint">系統將解析內容並提取關鍵知識點</p>
      </div>
      <div v-else class="file-info">
        <div class="file-name">{{ fileName }}</div>
        <div class="status" v-if="localLoading">⏳ 正在解析...</div>
      </div>
    </div>

    <div class="action-bar">
      <button class="primary-button" :disabled="!selectedFile || localLoading" @click="confirmUpload">
        {{ localLoading ? '⏳ 處理中...' : '🚀 解析並提取知識點' }}
      </button>
      <button v-if="selectedFile && !localLoading" class="ghost-button" @click="reset">重新選擇</button>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
  </div>
</template>

<script>
import axios from 'axios'
export default {
  name: 'UploadSection',
  props: { loading: { type: Boolean, default: false } },
  data() { return { localLoading: false, fileName: '', errorMsg: '', selectedFile: null } },
  methods: {
    reset(){ this.fileName=''; this.errorMsg=''; this.selectedFile=null },
    onFileChange(e){
      const file = e.target.files?.[0]
      if(!file){ this.selectedFile=null; this.fileName=''; return }
      this.selectedFile = file
      this.fileName = file.name
      this.errorMsg=''
    },
    async confirmUpload(){
      if(!this.selectedFile) return
      const form = new FormData(); form.append('file', this.selectedFile)
      this.localLoading = true
      try {
        const res = await axios.post('/api/upload-material', form)
        const data = res.data?.data
        if(!data) throw new Error('返回資料不完整')
        this.$emit('material-loaded', data)
      } catch(err){ this.errorMsg = '上傳失敗：' + (err.userMessage || err.message) }
      finally { this.localLoading=false }
    }
  }
}
</script>

<style scoped>
.upload-section { display:flex; flex-direction:column; gap:20px; }
.fancy-card { background:var(--card-bg,#fff); border:1px solid var(--border,#e2e8f0); border-radius:18px; padding:28px 30px 32px; box-shadow:var(--shadow,0 4px 12px rgba(0,0,0,.04)); position:relative; overflow:hidden; }
.fancy-card:before { content:""; position:absolute; inset:0; background:linear-gradient(120deg,rgba(25,118,210,.06),rgba(25,118,210,0)); pointer-events:none; }
.card-header { display:flex; justify-content:space-between; align-items:flex-start; }
.title-block { display:flex; gap:14px; align-items:center; }
.title-block h2 { margin:0 0 4px; font-size:1.3rem; letter-spacing:.5px; }
.sub { margin:0; font-size:.78rem; color:#60738a; font-weight:500; }
.icon { font-size:1.8rem; }
.file-area { position:relative; border:2px dashed #b9c4d1; border-radius:16px; min-height:150px; display:flex; align-items:center; justify-content:center; background:#f5f8fb; transition:.3s; padding:18px; }
.file-area:hover { border-color:#1976d2; background:#f0f6fc; }
.file-area.hasFile { border-style:solid; border-color:#1976d2; background:#eef6ff; }
.file-area.uploading { opacity:.6; }
.file-input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
.placeholder { text-align:center; }
.main-hint { margin:0 0 6px; font-weight:600; color:#2c3e50; }
.hint { margin:0; font-size:.75rem; color:#6e7b88; }
.file-info { display:flex; flex-direction:column; gap:6px; align-items:center; }
.file-name { background:#fff; padding:10px 16px; border-radius:12px; font-size:.85rem; font-weight:600; color:#1a2b3c; border:1px solid #d6dee6; max-width:100%; word-break:break-all; box-shadow:0 2px 4px rgba(0,0,0,.04); }
.status { font-size:.75rem; color:#1976d2; font-weight:600; letter-spacing:.5px; }
.action-bar { display:flex; gap:14px; flex-wrap:wrap; }
.primary-button { background:#1976d2; color:#fff; border:none; padding:12px 26px; border-radius:10px; font-weight:600; cursor:pointer; font-size:.95rem; letter-spacing:.5px; box-shadow:0 3px 8px -2px rgba(25,118,210,.4); transition:.25s; }
.primary-button:hover:not(:disabled) { background:#145fa5; }
.primary-button:disabled { opacity:.55; cursor:not-allowed; box-shadow:none; }
.ghost-button { background:#fff; color:#374151; border:2px solid #d0d8e1; padding:11px 22px; border-radius:10px; font-weight:600; cursor:pointer; font-size:.9rem; transition:.25s; }
.ghost-button:hover { border-color:#1976d2; color:#1976d2; }
.error-msg { margin:4px 2px 0; font-size:.75rem; color:#d32f2f; font-weight:600; }
@media (max-width:640px){ .fancy-card { padding:22px 20px 26px; } .primary-button, .ghost-button { flex:1 1 100%; text-align:center; } }
</style>
