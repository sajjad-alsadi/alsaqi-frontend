#!/bin/sh
set -e

# Substitute environment variables in config template
envsubst '${SERVER_NAME}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Validate configuration syntax
nginx -t || { echo "ERROR: Nginx configuration is invalid"; exit 1; }

# Start nginx (or whatever CMD was passed)
exec "$@"
