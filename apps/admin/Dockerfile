# KARVON admin paneli — statik SPA, nginx orqali.
#
# Build konteksti — REPO ILDIZI:
#   docker build -f apps/admin/Dockerfile \
#     --build-arg VITE_API_BASE_URL=https://api.karvon.uz/v1 -t karvon-admin .
#
# API manzili BUILD paytida kodga yoziladi (Vite `import.meta.env`) —
# boshqa domen uchun tasvir qayta yig'iladi. CSP dagi manbalar esa
# ishga tushishda beriladi (API_ORIGIN, FILES_ORIGIN).

ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace=@karvon/admin --include-workspace-root --no-audit --no-fund
COPY apps/admin apps/admin

ARG VITE_API_BASE_URL
# Manzilsiz yig'ilgan panel jimgina `localhost:3000` ga murojaat qilardi —
# xato deploydan keyin ma'lum bo'lardi. Shu yerda to'xtatamiz
RUN test -n "$VITE_API_BASE_URL" || (echo "VITE_API_BASE_URL berilmagan" >&2 && exit 1)
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build --workspace=@karvon/admin

FROM nginx:1.27-alpine AS runtime
# `templates/*.template` — ishga tushishda envsubst orqali conf.d ga
# yoziladi (faqat berilgan o'zgaruvchilar almashtiriladi, `$uri` qoladi)
COPY apps/admin/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
ENV API_ORIGIN=https://api.karvon.uz \
    FILES_ORIGIN=https://files.karvon.uz
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
