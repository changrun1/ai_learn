# AI Learn — AI 教材練習與錯誤檢查系統

AI Learn 是一套結合 Google Gemini 的智慧學習輔助平台，透過自動化的教材解析、題目生成與錯誤檢查流程，協助教師或自學者快速建立練習題並檢視學習盲點。專案以 Vue 2 + Express 打造，並提供完整的 Docker 化部署體驗。

## ✨ 功能總覽

- **教材上傳與解析**：支援 TXT、PDF、DOCX，會自動抽取關鍵主題、概念與摘要。
- **AI 題庫生成**：根據教材內容打造多選、是非與簡答題，包含干擾選項與解析。
- **作答與評分**：前端提供作答介面，後端評分並回饋弱點分析。
- **錯誤檢查模式**：可裁切教材片段，針對錯誤敘述提供說明與建議。
- **一鍵部署**：Docker Compose 同時啟動前後端，內建健康檢查與 Nginx 反向代理。

## 🧱 架構與技術

| Layer | Tech | 說明 |
| --- | --- | --- |
| Frontend | Vue 2, Axios, Nginx | SPA 介面、統一走 `/api/*` 反向代理 |
| Backend | Express, Multer, Google Gemini SDK | API、檔案上傳與題目/評分邏輯 |
| Workspace | Yarn workspaces | `server/` 與 `app/` 共用依賴管理 |
| Deploy | Docker Compose | Node 20 Alpine + Nginx Alpine，貼心健康檢查 |

### 專案結構

```
.
├── app/                 # Vue 2 前端 (含 Dockerfile、Nginx 設定)
├── server/              # Express 後端與檔案上傳目錄
├── docker-compose.yml   # 前後端一鍵啟動
├── README_DOCKER.md     # 先前的 Docker 筆記，可配合閱讀
├── START.md             # 詳細啟動指南（本地網路/防火牆說明）
└── .env                 # 共用環境變數設定（請妥善保護金鑰）
```

## ⚙️ 環境需求

- Node.js ≥ 18（建議 20）
- Yarn ≥ 1.22
- Docker Desktop（若要使用容器部署）
- Google Gemini API 金鑰（`GEMINI_API_KEY`）

> 若使用 `.env` 內建示範金鑰，請儘速更換為自己的金鑰並避免對外公開倉庫。

## 🚀 本地開發流程

1. 安裝依賴：
   ```powershell
   yarn install:all
   ```
2. 啟動前後端開發伺服器（熱重新整理 / Nodemon）：
   ```powershell
   yarn dev
   ```
3. 前端預設服務於 `http://localhost:8080`，後端 REST API 於 `http://localhost:3000`。
4. 關鍵 API：
   - `POST /api/upload-material`
   - `POST /api/generate-questions`
   - `POST /api/submit-answers`
   - `POST /api/check-errors`
   - `GET  /api/health`

> 透過 `docker-compose.yml` 中的 dev 代理設定，前端向 `/api/*` 發出的請求會直接傳給後端。

## 🐳 Docker 一鍵部署

1. 確保 `.env` 內部設定正確（尤其是 Gemini API 金鑰）。
2. 建置並啟動：
   ```powershell
   docker compose up -d --build
   ```
3. 前端：`http://localhost:8080`（Nginx 會將 `/api/*` 轉發到後端容器）。
4. 後端健康檢查：
   ```powershell
   curl http://localhost:8080/api/health
   ```
5. 停止服務：
   ```powershell
   docker compose down
   ```

### 容器組態重點

- `app/Dockerfile`：先在 Node 20 Alpine 建置，再以 Nginx Alpine 提供靜態檔。
- `app/nginx.conf`：處理 SPA 路由並反向代理 `/api` → `server:3000`。
- `server/Dockerfile`：輕量化 node:20-alpine，掛載 `uploads/` 卷以保存檔案。

## 🧾 環境變數對照

| 變數 | 範例 | 用途 |
| --- | --- | --- |
| `SERVER_HOST` | `0.0.0.0` | 後端綁定位址 |
| `SERVER_PORT` | `3000` | 後端服務埠 |
| `API_BASE_URL` | `http://localhost:3000` | 前端直連後端時的基底路徑 |
| `GEMINI_API_KEY` | `sk-...` | Gemini API 金鑰 |
| `GEMINI_MODEL` | `gemini-2.5-flash` | AI 模型名稱 |
| `ALLOWED_ORIGINS` | `http://localhost:8080,...` | CORS 白名單 |
| `UPLOAD_DIR` | `./server/uploads` | 上傳檔案儲存位置 |

更多選項可參考 `.env` 與 `CONFIG.md`。

## 🧪 驗證與疑難排解

- `curl http://localhost:3000/api/health`：確認後端無誤。
- 若 `http://localhost:8080` 顯示其他專案，請排查是否有其他程式占用 8080。
- 若上傳報錯 `UNSUPPORTED_FILE_TYPE`，請確認檔案類型為 `txt/pdf/doc/docx`。
- 確保 Windows 防火牆已允許 3000/8080，詳見 `START.md`。

## 🧭 推薦工作流程

- 建議使用 `git` + GitHub 管理版本，並搭配 PR 審查。
- 若需部署到雲端，可將 Docker Compose 移植到伺服器，或整合到 Kubernetes。
- 改動公開行為時，同步更新 README 與 `START.md`，保持團隊共識。

---

若需更多細節，可先閱讀 `README_DOCKER.md` 與 `START.md`。有任何疑問，歡迎開 issue 或進一步討論！
