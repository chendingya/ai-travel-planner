# Multi-stage build producing a single image serving both frontend (static) and backend API

# 1) Build frontend
FROM node:21-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# 2) Install backend production deps
FROM node:21-alpine AS backend-builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ .

# 3) Final runtime image
FROM node:21-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy backend app and frontend dist
COPY --from=backend-builder /app /app
COPY --from=frontend-builder /frontend/dist /app/public

EXPOSE 3001
CMD ["node", "src/index.js"]
