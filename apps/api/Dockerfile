# KARVON API — ishlab chiqarish tasviri.
#
# Build konteksti — REPO ILDIZI (npm workspaces):
#   docker build -f apps/api/Dockerfile -t karvon-api .
#
# BOSQICHLAR:
#   deps      — barcha bog'liqliklar (build uchun TypeScript va Nest CLI kerak)
#   build     — `nest build` → dist (yo'l taxalluslari `@/...` shu yerda
#               nisbiy yo'lga aylanadi — ts-node va tsconfig-paths kerak emas)
#   prod-deps — faqat ishlab chiqarish bog'liqliklari: tasvir kichikroq,
#               hujum yuzasi kam (ts-node, jest va boshqalar kirmaydi)
#   runtime   — root EMAS foydalanuvchi, tini (SIGTERM to'g'ri yetadi)
#
# Migratsiya shu tasvirning o'zi bilan (alohida vosita kerak emas):
#   docker compose run --rm api node dist/infra/database/migrator.js up

# Ishlab chiqish va CI bilan BIR XIL asosiy versiya
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
# Workspace'dagi HAMMA package.json lar: lockfile ularni kutadi, bittasi
# yetishmasa `npm ci` lockfile mos kelmaydi deb yiqiladi
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace=@karvon/api --include-workspace-root --no-audit --no-fund

FROM deps AS build
COPY apps/api apps/api
RUN npm run build --workspace=@karvon/api

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
# Workspace'da paketlar ildizga ko'tariladi, versiyasi to'qnashganlari esa
# apps/api/node_modules da qoladi — ikkalasini bitta papkaga yig'amiz
RUN npm ci --workspace=@karvon/api --omit=dev --no-audit --no-fund \
 && mkdir -p /out \
 && cp -R node_modules /out/node_modules \
 && if [ -d apps/api/node_modules ]; then cp -R apps/api/node_modules/. /out/node_modules/; fi

FROM ${NODE_IMAGE} AS runtime
RUN apk add --no-cache tini && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production \
    DB_MIGRATIONS_DIR=/app/db/migrations \
    DB_SEEDS_DIR=/app/db/seeds
COPY --from=prod-deps /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./package.json
COPY db ./db
USER app
EXPOSE 3000
# `/health` — prefikssiz (main.ts): orkestrator uchun barqaror manzil
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
