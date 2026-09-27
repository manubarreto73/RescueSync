# syntax=docker/dockerfile:1

###########################################
# Etapa 1: dependencias + codigo (desarrollo)
###########################################
FROM node:24-alpine AS development

# Prisma necesita openssl para su query engine; node:alpine no lo trae.
RUN apk add --no-cache openssl

WORKDIR /app

# Se copian primero los manifiestos y el schema para aprovechar la cache de
# capas de Docker: si no cambiaron, Docker reutiliza el npm ci anterior.
# El schema hace falta porque el postinstall corre `prisma generate`.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["npm", "run", "start:dev"]

###########################################
# Etapa 2: compilacion TypeScript -> JavaScript
###########################################
FROM node:24-alpine AS build

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# Se eliminan las devDependencies para que la imagen final pese lo minimo.
# --ignore-scripts evita que el postinstall vuelva a correr prisma generate
# (el CLI ya no esta disponible tras la poda).
RUN npm prune --omit=dev --ignore-scripts

###########################################
# Etapa 3: imagen final de produccion
###########################################
FROM node:24-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

# node:alpine ya trae un usuario sin privilegios llamado "node".
# node_modules incluye el cliente de Prisma ya generado en la etapa anterior.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
