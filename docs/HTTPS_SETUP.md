# إعداد HTTPS/TLS

## الخيار 1: Reverse Proxy (مُوصى به للإنتاج)

### Nginx
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### Traefik (Docker)
```yaml
# docker-compose.yml
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@your-domain.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "./letsencrypt:/letsencrypt"
      - "/var/run/docker.sock:/var/run/docker.sock:ro"

  alsaqi:
    build: .
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.alsaqi.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.alsaqi.entrypoints=websecure"
      - "traefik.http.routers.alsaqi.tls.certresolver=letsencrypt"
```

## الخيار 2: HTTPS مباشر (للاختبار فقط)

إضافة متغيرات البيئة:
```env
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

## الخيار 3: Self-Signed Certificate (للتطوير)

```bash
# توليد شهادة ذاتية التوقيع
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=localhost"
```

## ملاحظات أمنية

- في الإنتاج، استخدم دائماً شهادات من CA موثوق (Let's Encrypt مجاني)
- تأكد من تعيين `trust proxy` في Express (مُفعّل بالفعل: `app.set('trust proxy', 1)`)
- HSTS header مُفعّل تلقائياً في وضع الإنتاج
- WebSocket يعمل عبر `wss://` تلقائياً عند استخدام HTTPS
