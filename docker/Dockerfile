FROM node:22-bookworm-slim

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/daemon/package.json ./packages/daemon/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/llm-sdk/package.json ./packages/llm-sdk/package.json
COPY packages/sandbox/package.json ./packages/sandbox/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ENV NODE_ENV=production

RUN chown -R node:node /app
USER node

EXPOSE 7433

CMD ["node", "--import", "tsx", "packages/daemon/src/index.ts"]
