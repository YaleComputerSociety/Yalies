FROM node:22-slim AS build
WORKDIR /workspace
COPY yalies-shared ./yalies-shared
RUN cd yalies-shared && npm ci && npm run build

WORKDIR /workspace/yalies-external/yalies-backend
COPY yalies-external/yalies-backend/package*.json ./
RUN npm ci
COPY yalies-external/yalies-backend ./
RUN npm run build && npm prune --omit=dev

WORKDIR /workspace/yalies-external/yalies-web
COPY yalies-external/yalies-web/package*.json ./
RUN npm ci
COPY yalies-external/yalies-web ./
ARG PREVIEW_ORIGIN
ENV NEXT_PUBLIC_YALIES_API_URL=$PREVIEW_ORIGIN
ENV YALIES_PREVIEW=true
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /workspace
ENV NODE_ENV=production
ENV YALIES_PREVIEW=true
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /workspace ./
COPY preview/start.mjs ./preview/start.mjs
EXPOSE 8080
CMD ["node", "preview/start.mjs"]
