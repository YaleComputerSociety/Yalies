FROM node:22.23.3-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY . .
RUN npm ci
ARG PREVIEW_ORIGIN
ENV NEXT_PUBLIC_YALIES_API_URL=$PREVIEW_ORIGIN
ENV YALIES_PREVIEW=true
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w yalies-backend && npm run build -w yalies-web
RUN npm prune --omit=dev --ignore-scripts
FROM node:22.23.3-slim
WORKDIR /workspace
ENV NODE_ENV=production
ENV YALIES_PREVIEW=true
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /workspace ./
EXPOSE 8080
CMD ["node", "deploy/preview/start.mjs"]
