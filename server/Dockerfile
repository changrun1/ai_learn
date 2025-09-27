# Backend Dockerfile
FROM node:20-alpine
WORKDIR /app/server
COPY ../package.json ../yarn.lock /app/
COPY package.json ./
RUN corepack enable && yarn install --production --cwd /app && yarn install --production
COPY . .
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "index.js"]
