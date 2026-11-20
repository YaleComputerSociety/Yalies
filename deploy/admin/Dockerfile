FROM node:22.23.3-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY . .
RUN npm ci
ENV NEXT_PUBLIC_SCRAPER_API_URL=""
ENV NEXT_PUBLIC_BACKEND_API_URL="https://api.yalies.io"
ENV NEXT_TELEMETRY_DISABLED=1
ENV DASHBOARD_BASE_PATH=/admin
RUN npm run build -w yalies-data-pipeline && npm run build -w yalies-dashboard
RUN npm prune --omit=dev --ignore-scripts

FROM node:22.23.3-slim
WORKDIR /workspace
ENV NODE_ENV=production
ENV AUTH_MODE=cas
ENV DASHBOARD_STATIC_DIR=/workspace/apps/dashboard/out
ENV DASHBOARD_BASE_PATH=/admin
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages/shared ./packages/shared
COPY --from=build /workspace/apps/pipeline ./apps/pipeline
COPY --from=build /workspace/apps/dashboard/out ./apps/dashboard/out
WORKDIR /workspace/apps/pipeline
EXPOSE 8080
CMD ["node", "build/server.js"]
