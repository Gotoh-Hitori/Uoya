ARG FRP_VERSION=v0.72.0
FROM ghcr.io/fatedier/frpc:${FRP_VERSION} AS frp
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY LongMemory-main/LongMemory-main/package.json LongMemory-main/LongMemory-main/LICENSE ./LongMemory-main/LongMemory-main/
COPY LongMemory-main/LongMemory-main/src ./LongMemory-main/LongMemory-main/src
RUN npm ci
COPY index.html vite.config.js LICENSE ./
COPY docs/licenses ./docs/licenses
COPY src ./src
COPY public ./public
COPY server ./server
RUN npm run memory:build && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production WEB_HOST=0.0.0.0 WEB_PORT=8080 CHAT_API_PORT=3001 FRPC_PATH=/usr/local/bin/frpc NETWORK_ROOT=/state DATABASE_FILE=/app/server/social-chat/data/bluehaven.sqlite PERSONA_FILE=/app/server/social-chat/data/persona.md
WORKDIR /app
COPY --from=frp /usr/bin/frpc /usr/local/bin/frpc
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/LICENSE ./LICENSE
COPY --from=build --chown=node:node /app/docs/licenses ./docs/licenses
RUN mkdir -p /state/.network /app/server/social-chat/data && chown -R node:node /state /app/server/social-chat/data && frpc --version
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/social-api/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start.mjs"]
