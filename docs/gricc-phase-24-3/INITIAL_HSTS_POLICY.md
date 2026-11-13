# GRICC 2.0 — Phase 24.3: Initial HSTS Policy & Staged Rollout Strategy
**HTTP Strict Transport Security (HSTS) Staged Deployment Specification**

**Project:** GRICC Nexus  
**Domain Target:** `griccnexus.com` / `www.griccnexus.com`  
**Document:** `INITIAL_HSTS_POLICY.md`  
**Date:** November 13, 2026  
**Auditor & Implementation Engineer:** Application Security Specialist  

---

## 1. Executive Summary & Rationale

HTTP Strict Transport Security (HSTS) (RFC 6797) instructs web browsers to only interact with a given domain over HTTPS, preventing SSL stripping and man-in-the-middle downgrade attacks.

However, HSTS directives are cached aggressively by client browsers:
- If `preload` or multi-year `max-age` (e.g. `max-age=31536000`) is served on a newly deployed site that subsequently experiences TLS certificate renewal failures or DNS routing modifications, all visitors will be locked out with unbypassable browser security errors.
- Preloading hardcodes the domain into Chrome, Firefox, Safari, and Edge browser binaries, requiring months of manual delisting requests to reverse.

Phase 24.3 establishes a **Staged HSTS Rollout Policy** starting with a conservative initial policy for deployment.

---

## 2. Staged Rollout Roadmap

| Stage | Duration | Header Directive | Purpose & Safety Margin |
| :--- | :--- | :--- | :--- |
| **Stage 1 (Initial Launch)** | Day 1 to Day 14 | `Strict-Transport-Security "max-age=86400" always;` | 24-hour cache window. Allows fast rollback if certificate issues arise. |
| **Stage 2 (Staging Stabilization)** | Day 15 to Day 45 | `Strict-Transport-Security "max-age=2592000" always;` | 30-day cache window. Verifies that Certbot auto-renewal completes at day 30. |
| **Stage 3 (Full Production Hardening)**| Day 46 to Day 90 | `Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` | 1-year cache window covering all subdomains. |
| **Stage 4 (HSTS Preload Submission)** | Day 90+ | `Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;` | Submit to `hstspreload.org` once zero certificate errors have occurred over 90 days. |

---

## 3. Implementation in `deploy/nginx.griccnexus.com.conf`

In `deploy/nginx.griccnexus.com.conf`, the Stage 1 conservative header is active:
```nginx
# Security Headers (Conservative Initial HSTS: 86400s / 1 day, no preload, no includeSubDomains)
# Elevate to "max-age=31536000; includeSubDomains; preload" after certificate renewal is verified.
add_header Strict-Transport-Security "max-age=86400" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
```

---

## 4. Operational Instructions for Elevating HSTS

After the system has operated continuously for 14 days and Let's Encrypt renewal dry-run succeeds (`sudo certbot renew --dry-run`):

### Elevating to Stage 2:
1. Edit `/etc/nginx/sites-available/griccnexus.com`:
   ```nginx
   add_header Strict-Transport-Security "max-age=2592000" always;
   ```
2. Test and reload:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

### Elevating to Stage 3:
After 45 days of error-free operation:
1. Update header:
   ```nginx
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
   ```
2. Test and reload:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
