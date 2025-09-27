import Vue from 'vue'
import App from './App.vue'
import axios from 'axios'

Vue.config.productionTip = false

// 動態 API 基底 (環境變數或自動推斷)
const envBase = process.env.VUE_APP_API_BASE_URL || process.env.API_BASE_URL
let baseURL = envBase || '/api'
if (/^https?:/i.test(baseURL)) {
  baseURL = baseURL.replace(/\/?$/, '')
} else {
  baseURL = baseURL.startsWith('/') ? baseURL : `/${baseURL}`
}
axios.defaults.baseURL = baseURL
axios.defaults.timeout = 0 // 無限等待

axios.interceptors.request.use(config => {
  if (config.url && typeof config.url === 'string') {
    if (/^https?:/i.test(config.url)) {
      return config
    }
    const base = config.baseURL || axios.defaults.baseURL || ''
    if (base.endsWith('/api') && config.url.startsWith('/api')) {
      config.url = config.url.replace(/^\/api/, '') || '/'
    }
    if (!config.url.startsWith('/')) {
      config.url = `/${config.url}`
    }
  }
  return config
})

axios.interceptors.response.use(
  r => r,
  err => {
    let userMessage = '請求失敗'
    if (err.response) {
      userMessage = err.response.data?.error || `服務錯誤(${err.response.status})`
    } else if (err.request) {
      userMessage = '伺服器無回應，請稍後再試'
    } else {
      userMessage = err.message || '未知錯誤'
    }
    err.userMessage = userMessage
    return Promise.reject(err)
  }
)

new Vue({ render: h => h(App) }).$mount('#app')
