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
COPY --from=build /app/contentStore.ts ./contentStore.ts
COPY --from=build /app/toolApi.ts ./toolApi.ts
COPY --from=build /app/hrtPairing.ts ./hrtPairing.ts
COPY --from=build /app/f2f.ts ./f2f.ts
COPY --from=build /app/backupPolicy.ts ./backupPolicy.ts
COPY --from=build /app/shareSnapshotSchema.ts ./shareSnapshotSchema.ts
COPY --from=build /app/passwordStrength.ts ./passwordStrength.ts
COPY --from=build /app/requestInput.ts ./requestInput.ts
COPY --from=build /app/shareExpiry.ts ./shareExpiry.ts
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/dist ./dist
COPY --from=build /app/hrt-server ./hrt-server
COPY docker/mark-applied-migrations.sql ./docker/mark-applied-migrations.sql
COPY docker/reconcile.mjs ./docker/reconcile.mjs
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN mkdir -p /data \
    && chmod +x ./docker/entrypoint.sh \
    && chown -R node:node /app /data

USER node

VOLUME ["/data"]
EXPOSE 8787
# Optional hrt/1 raw transport; only listen when HRT_RAW_ENABLED=1.
EXPOSE 9443

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||'8787')+'/api/transparency').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["./docker/entrypoint.sh"]
