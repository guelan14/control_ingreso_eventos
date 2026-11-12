# Imagen de producción del sistema de control de ingreso.
#   docker compose up -d --build         (app + Postgres)
#   docker compose exec app npm run usuario:crear -- --usuario admin --nombre "Nombre" --rol admin
# Al arrancar aplica las migraciones pendientes y después levanta Next.js en el puerto 3000.

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NPM_CONFIG_UPDATE_NOTIFIER=false

# Dependencias completas, para compilar.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Solo dependencias de producción, más tsx para el script de alta de usuarios.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && TSX=$(node -p "require('./package-lock.json').packages['node_modules/tsx'].version") \
 && npm install --no-save --no-package-lock "tsx@$TSX" \
 && npm cache clean --force

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --chown=node:node package.json next.config.ts tsconfig.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts
# El script de usuarios usa el código de src/lib y src/db.
COPY --chown=node:node src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/salud || exit 1
CMD ["sh", "-c", "node scripts/migrar.mjs && exec node_modules/.bin/next start"]
