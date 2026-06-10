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

# Add non-root user (UID 1001, no home dir, no login shell)
RUN adduser -D -H -u 1001 -s /sbin/nologin appuser

# Create tmpfs-mountable directories for Nginx temp files (pid, cache, logs)
# These are the only directories that need to be writable when running with --read-only
RUN mkdir -p /tmp/nginx/pid \
             /tmp/nginx/cache/client_temp \
             /tmp/nginx/cache/proxy_temp \
             /tmp/nginx/cache/fastcgi_temp \
             /tmp/nginx/cache/uwsgi_temp \
             /tmp/nginx/cache/scgi_temp \
             /tmp/nginx/logs \
    && chown -R appuser:appuser /tmp/nginx \
    && chmod -R 755 /tmp/nginx

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Ensure the non-root user can read static assets
RUN chown -R appuser:appuser /usr/share/nginx/html

# Create main nginx.conf that runs as non-root with temp dirs in /tmp/nginx
RUN printf 'worker_processes auto;\n\
pid /tmp/nginx/pid/nginx.pid;\n\
error_log /tmp/nginx/logs/error.log warn;\n\
\n\
events {\n\
    worker_connections 1024;\n\
}\n\
\n\
http {\n\
    include /etc/nginx/mime.types;\n\
    default_type application/octet-stream;\n\
\n\
    # Disable server version in responses\n\
    server_tokens off;\n\
\n\
    # Gzip compression\n\
    gzip on;\n\
    gzip_min_length 256;\n\
    gzip_types text/html text/css application/javascript application/json image/svg+xml;\n\
    gzip_vary on;\n\
\n\
    # Temp file paths in writable directory\n\
    client_body_temp_path /tmp/nginx/cache/client_temp;\n\
    proxy_temp_path /tmp/nginx/cache/proxy_temp;\n\
    fastcgi_temp_path /tmp/nginx/cache/fastcgi_temp;\n\
    uwsgi_temp_path /tmp/nginx/cache/uwsgi_temp;\n\
    scgi_temp_path /tmp/nginx/cache/scgi_temp;\n\
\n\
    access_log /tmp/nginx/logs/access.log;\n\
\n\
    sendfile on;\n\
    keepalive_timeout 65;\n\
\n\
    include /etc/nginx/conf.d/*.conf;\n\
}\n' > /etc/nginx/nginx.conf

# Create security headers snippet (included in server and location blocks that use add_header)
RUN mkdir -p /etc/nginx/snippets && printf '\
add_header Content-Security-Policy "default-src '"'"'self'"'"'; connect-src '"'"'self'"'"' wss:; frame-ancestors '"'"'none'"'"'" always;\n\
add_header X-Content-Type-Options "nosniff" always;\n\
add_header X-Frame-Options "DENY" always;\n\
add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\n\
add_header Cross-Origin-Opener-Policy "same-origin" always;\n\
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n' > /etc/nginx/snippets/security-headers.conf

# Create server block configuration with security headers
RUN printf 'server {\n\
    listen 8080;\n\
    listen [::]:8080;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # Security Headers (applied to ALL responses via always directive)\n\
    include /etc/nginx/snippets/security-headers.conf;\n\
\n\
    # SPA fallback - serve index.html for all routes\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Immutable cache for hashed static assets (Vite produces content-hashed filenames)\n\
    location ~* \\.(js|css|png|jpg|svg|woff2)$ {\n\
        add_header Cache-Control "public, max-age=31536000, immutable" always;\n\
        include /etc/nginx/snippets/security-headers.conf;\n\
    }\n\
\n\
    # Health check endpoint\n\
    location /health {\n\
        access_log off;\n\
        return 200 "ok";\n\
        add_header Content-Type text/plain always;\n\
        include /etc/nginx/snippets/security-headers.conf;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

# Switch to non-root user
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
