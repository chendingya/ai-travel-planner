# Multi-stage build producing a single image serving both frontend (static) and backend API

# Allow overriding the base Node image registry (e.g., use MCR or Chainguard to avoid Docker Hub)
ARG NODE_BASE=node:18-alpine
# Allow overriding npm registry (e.g., use https://registry.npmmirror.com when network is constrained)
ARG NPM_REGISTRY=https://registry.npmjs.org

# 1) Build frontend
FROM ${NODE_BASE} AS frontend-builder
ARG NPM_REGISTRY
WORKDIR /frontend
COPY frontend/package*.json ./
# Optional: switch npm registry for faster/more reliable installs in restricted networks
RUN npm config set registry ${NPM_REGISTRY} \
	&& npm ci

COPY frontend/ .
RUN npm run build

# 2) Install backend production deps
FROM ${NODE_BASE} AS backend-builder
ARG NPM_REGISTRY
WORKDIR /app
COPY backend/package*.json ./
RUN npm config set registry ${NPM_REGISTRY} \
	&& npm ci --omit=dev
COPY backend/ .

# 3) Final runtime image
FROM ${NODE_BASE} AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy backend app and frontend dist
COPY --from=backend-builder /app /app
COPY --from=frontend-builder /frontend/dist /app/public

EXPOSE 3001
CMD ["node", "src/index.js"]
