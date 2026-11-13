# GRICC 2.0 — Phase 24: HTTPS & Let's Encrypt SSL Configuration

**Document:** `HTTPS_AND_SSL_CONFIGURATION.md`  
**Phase:** 24 of 50 — Public VPS Hosting, Domain Connection, DNS, Nginx, HTTPS & Production Deployment  
**Domain:** `griccglobal.com` & `www.griccglobal.com`  
**Status:** SPECIFICATION READY  

---

## 1. Prerequisites for Certificate Issuance

Before executing Certbot:
1. Domain `griccglobal.com` and `www.griccglobal.com` must have DNS `A` records resolving to the public VPS IPv4 address.
2. Port 80/tcp must be open and accessible from the public internet.
3. Nginx must be running and serving the `/.well-known/acme-challenge/` location.

---

## 2. Automated Certificate Issuance via Certbot

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d griccglobal.com \
  -d www.griccglobal.com \
  --email security@griccglobal.com \
  --agree-tos \
  --no-eff-email
```

**Certificate Locations:**
- Full Certificate Chain: `/etc/letsencrypt/live/griccglobal.com/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/griccglobal.com/privkey.pem`

---

## 3. Automatic Renewal & Systemd Timer

Let's Encrypt certificates are valid for 90 days. Renewal is handled automatically via systemd:
```bash
# Verify dry-run renewal works cleanly
sudo certbot renew --dry-run
```

A post-renewal reload hook reloads Nginx upon certificate renewal:
```bash
# /etc/letsencrypt/renewal-hooks/post/nginx-reload.sh
#!/bin/sh
systemctl reload nginx
```
