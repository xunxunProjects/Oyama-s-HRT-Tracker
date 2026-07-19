FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    PERSIST_DIR=/data \
    D1_DATABASE_NAME=hrt-tracker-prod

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/wrangler.toml ./wrangler.toml
COPY --from=build /app/worker.ts ./worker.ts
COPY --from=build /app/dist ./dist
COPY docker/schema.sql ./docker/schema.sql
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN mkdir -p /data \
    && chmod +x ./docker/entrypoint.sh \
    && chown -R node:node /app /data

USER node

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||'8787')+'/api/transparency').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["./docker/entrypoint.sh"]
