FROM node:22.23.3-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY . .
RUN npm ci && npm run build -w yalies-backend
RUN npm prune --omit=dev --ignore-scripts
FROM node:22.23.3-slim
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages/shared ./packages/shared
COPY --from=build /workspace/apps/api ./apps/api
WORKDIR /workspace/apps/api
CMD ["node", "build/index.js"]
