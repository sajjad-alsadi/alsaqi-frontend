# =============================================================================
# AL-SAQI Web Frontend - Independent Deployment
# =============================================================================
# Multi-stage build:
#   Stage 1: Build the Vite/React frontend
#   Stage 2: Serve static assets with lightweight nginx
#
# This container operates independently of the API container.
# The SPA handles API unavailability gracefully on the client side.
# =============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root files for npm workspaces resolution
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install all workspace dependencies
RUN npm ci

# Copy shared package source (needed for build)
COPY packages/shared/ ./packages/shared/

# Copy web app source
COPY apps/web/ ./apps/web/

# Build shared package first (web depends on it)
RUN npm run build --workspace=@alsaqi/shared 2>/dev/null || true

# Build web frontend
RUN npm run build --workspace=@alsaqi/web

# Stage 2: Serve with nginx
FROM nginx:alpine AS runtime

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf

# Add custom nginx config for SPA routing
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Create nginx config that serves the SPA with proper fallback for client-side routing
RUN printf 'server {\n\
    listen 8080;\n\
    listen [::]:8080;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # SPA fallback - serve index.html for all routes\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Cache static assets\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
        expires 7d;\n\
        add_header Cache-Control "public, max-age=604800, immutable";\n\
    }\n\
\n\
    # Health check endpoint\n\
    location /health {\n\
        access_log off;\n\
        return 200 "ok";\n\
        add_header Content-Type text/plain;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
