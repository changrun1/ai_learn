# Frontend Dockerfile (Workspace-aware)
FROM node:20-alpine AS build
WORKDIR /workspace

# 複製 monorepo 工作區所需檔案
COPY package.json yarn.lock ./
COPY app ./app
COPY server/package.json ./server/package.json

RUN corepack enable && yarn install --frozen-lockfile --production=false

# 建置前端
ARG VUE_APP_API_BASE_URL
ENV VUE_APP_API_BASE_URL=${VUE_APP_API_BASE_URL}
RUN yarn workspace app build

FROM nginx:alpine
COPY --from=build /workspace/app/dist /usr/share/nginx/html
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
