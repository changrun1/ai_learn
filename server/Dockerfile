# Backend Dockerfile (Revised)
FROM node:20-alpine
WORKDIR /app
# 只複製 server 目錄內需要的檔案
COPY package.json yarn.lock ./
RUN corepack enable && yarn install --production
# 再複製其餘源碼
COPY . .
# 環境變數（程式目前讀的是 PORT / HOST）
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
