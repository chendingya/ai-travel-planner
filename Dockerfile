# Multi-stage build producing a single image serving both frontend (static) and backend API

# Allow overriding the base Node image registry (e.g., use MCR or Chainguard to avoid Docker Hub)
ARG NODE_BASE=node:18-bookworm-slim
# Allow overriding npm registry (e.g., use https://registry.npmmirror.com when network is constrained)
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG PIPER_MODEL_URL=
ARG PIPER_MODEL_CONFIG_URL=

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
ARG PIPER_MODEL_URL
ARG PIPER_MODEL_CONFIG_URL
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 python3-venv curl ca-certificates \
	&& python3 -m venv /opt/piper \
	&& /opt/piper/bin/pip install --no-cache-dir --upgrade pip \
	&& /opt/piper/bin/pip install --no-cache-dir piper-tts pathvalidate \
	&& ln -sf /opt/piper/bin/piper /usr/local/bin/piper \
	&& rm -rf /var/lib/apt/lists/*

# Copy backend app and frontend dist
COPY --from=backend-builder /app /app
COPY --from=frontend-builder /frontend/dist /app/public
COPY docker/start-app.sh /usr/local/bin/start-app

RUN mkdir -p /app/runtime/piper /app/runtime/audio \
	&& chmod +x /usr/local/bin/start-app \
	&& if [ -n "${PIPER_MODEL_URL}" ]; then curl -fsSL "${PIPER_MODEL_URL}" -o /app/runtime/piper/model.onnx; fi \
	&& if [ -n "${PIPER_MODEL_CONFIG_URL}" ]; then curl -fsSL "${PIPER_MODEL_CONFIG_URL}" -o /app/runtime/piper/model.onnx.json; fi

EXPOSE 3002
CMD ["/usr/local/bin/start-app"]
