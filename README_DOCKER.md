# Docker 部署使用指南

## 前置需求
- 已安裝 Docker 與 Docker Compose
- 於專案根目錄放置 `.env` 並填入 GEMINI_API_KEY 等必要變數

## 一鍵啟動
```bash
docker compose up -d --build
```
啟動後：
- 前端：http://localhost:8080
- 後端 API：http://localhost:3000

## 停止與清除
```bash
docker compose down
# 連同 volume (上傳檔案) 一併清除
# docker compose down -v
```

## 調整環境變數
修改根目錄 `.env` 後，若影響 build (例如 API_BASE_URL) 需重建：
```bash
docker compose up -d --build frontend
```
或全部重建：
```bash
docker compose up -d --build
```

## 上傳檔案保存
`server/uploads` 會掛載到容器內，確保重啟不遺失。

## 常見問題
1. 若前端無法呼叫 API，確認 axios 指向 `http://server:3000`（Compose 內服務名稱解析)。我們已在 compose 設定 `VUE_APP_API_BASE_URL`。
2. 若修改了 `GEMINI_API_KEY`，重啟 server：
```bash
docker compose restart server
```
