FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production NOTICETV_HOST=0.0.0.0 NOTICETV_DATA_DIR=/data PORT=3000
WORKDIR /app
RUN install -d -o node -g node -m 700 /data
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server/access-key.mjs ./server/access-key.mjs
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "build/server/index.js"]
