FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/database/package.json packages/database/package.json

RUN npm ci

COPY apps/worker apps/worker
COPY packages/shared packages/shared
COPY packages/database packages/database

RUN npx prisma generate --schema packages/database/prisma/schema.prisma && npm run build -w @readlocal/shared && npm run build -w @readlocal/worker

CMD ["npm", "run", "start", "-w", "@readlocal/worker"]
