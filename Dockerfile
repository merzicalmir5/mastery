FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY api/package*.json ./
COPY api/prisma ./prisma
RUN npm ci

FROM deps AS build
COPY api/prisma ./prisma
COPY api/tsconfig*.json api/nest-cli.json ./
COPY api/src ./src
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl libc6-compat

COPY api/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY api/prisma ./prisma

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
