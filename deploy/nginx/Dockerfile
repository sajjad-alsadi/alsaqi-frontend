# =============================================================================
# Custom Nginx with Brotli Module
# =============================================================================
# Based on fholzer/nginx-brotli which provides nginx with the ngx_brotli module
# pre-compiled. This enables Brotli compression at the proxy level for better
# compression ratios than gzip alone.
#
# Alternative: Build from nginx:alpine and compile ngx_brotli from source
# (commented out below for reference).
# =============================================================================

FROM fholzer/nginx-brotli:latest

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf.example /etc/nginx/conf.d/default.conf

# Create directories for SSL certificates and certbot
RUN mkdir -p /etc/nginx/ssl /var/www/certbot

# Expose HTTP and HTTPS ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

# =============================================================================
# Alternative: Build from nginx:alpine with Brotli module from source
# =============================================================================
# FROM nginx:alpine AS builder
#
# RUN apk add --no-cache \
#     git \
#     gcc \
#     libc-dev \
#     make \
#     openssl-dev \
#     pcre2-dev \
#     zlib-dev \
#     linux-headers \
#     libxslt-dev \
#     gd-dev \
#     geoip-dev \
#     cmake
#
# # Get nginx version and download source
# RUN NGINX_VERSION=$(nginx -v 2>&1 | sed 's/.*\///' ) && \
#     wget http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz && \
#     tar -xzf nginx-${NGINX_VERSION}.tar.gz
#
# # Clone Brotli module
# RUN git clone --recurse-submodules https://github.com/google/ngx_brotli.git
#
# # Build Brotli as dynamic module
# RUN NGINX_VERSION=$(nginx -v 2>&1 | sed 's/.*\///') && \
#     cd nginx-${NGINX_VERSION} && \
#     ./configure --with-compat --add-dynamic-module=../ngx_brotli && \
#     make modules
#
# FROM nginx:alpine
#
# # Copy compiled Brotli modules
# COPY --from=builder /nginx-*/objs/ngx_http_brotli_filter_module.so /etc/nginx/modules/
# COPY --from=builder /nginx-*/objs/ngx_http_brotli_static_module.so /etc/nginx/modules/
#
# # Add load_module directives
# RUN echo "load_module modules/ngx_http_brotli_filter_module.so;" > /etc/nginx/modules-enabled/brotli.conf && \
#     echo "load_module modules/ngx_http_brotli_static_module.so;" >> /etc/nginx/modules-enabled/brotli.conf
#
# RUN rm -f /etc/nginx/conf.d/default.conf
# COPY nginx.conf.example /etc/nginx/conf.d/default.conf
# RUN mkdir -p /etc/nginx/ssl /var/www/certbot
#
# EXPOSE 80 443
# CMD ["nginx", "-g", "daemon off;"]
