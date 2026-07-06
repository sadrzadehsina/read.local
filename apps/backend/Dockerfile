FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/database/package.json packages/database/package.json

RUN npm ci

COPY apps/backend apps/backend
COPY packages/shared packages/shared

RUN npm run build -w @readlocal/shared && npm run build -w @readlocal/backend

CMD ["npm", "run", "start", "-w", "@readlocal/backend"]
