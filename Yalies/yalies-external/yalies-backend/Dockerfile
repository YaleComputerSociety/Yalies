FROM node:22-slim AS build

WORKDIR /app

# Install shared package
COPY yalies-shared/package.json yalies-shared/package-lock.json ./yalies-shared/
RUN cd yalies-shared && npm ci

COPY yalies-shared/ ./yalies-shared/
RUN cd yalies-shared && npm run build

# Install all dependencies (including devDependencies for TypeScript)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and compile
COPY . .
RUN npm run build

# Runtime image — only production deps
FROM node:22-slim AS runtime

WORKDIR /app

COPY yalies-shared/package.json yalies-shared/package-lock.json ./yalies-shared/
RUN cd yalies-shared && npm ci

COPY --from=build /app/yalies-shared/dist ./yalies-shared/dist

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/build ./build

CMD ["node", "build/index.js"]
