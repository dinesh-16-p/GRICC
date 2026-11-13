# GRICC 2.0 — Phase 24: HTTPS & Let's Encrypt SSL Configuration

**Document:** `HTTPS_AND_SSL_CONFIGURATION.md`  
**Phase:** 24 of 50 — Public VPS Hosting, Domain Connection, DNS, Nginx, HTTPS & Production Deployment  
**Domain:** `griccnexus.com` & `www.griccnexus.com`  
**Status:** SPECIFICATION READY  

---

## 1. Prerequisites for Certificate Issuance

Before executing Certbot:
1. Domain `griccnexus.com` and `www.griccnexus.com` must have DNS `A` records resolving to the public VPS IPv4 address.
2. Port 80/tcp must be open and accessible from the public internet.
3. Nginx must be running and serving the `/.well-known/acme-challenge/` location.

---

## 2. Automated Certificate Issuance via Certbot

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d griccnexus.com \
  -d www.griccnexus.com \
  --email security@griccnexus.com \
  --agree-tos \
  --no-eff-email
```

**Certificate Locations:**
- Full Certificate Chain: `/etc/letsencrypt/live/griccnexus.com/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/griccnexus.com/privkey.pem`

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
