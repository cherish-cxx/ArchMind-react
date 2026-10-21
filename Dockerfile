# 多阶段构建：node 里打包 → nginx 静态托管
FROM node:22-alpine AS build
WORKDIR /app

# 国内网络走 npmmirror；可用 --build-arg NPM_REGISTRY=... 覆盖
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" \
    && npm ci --no-audit --no-fund

COPY . .
# 生产构建不启用 mock（mock 只挂在 vite dev server 上，这里显式固定避免歧义）
ENV VITE_ENABLE_MOCK=false
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
