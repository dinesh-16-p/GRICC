# GRICC 2.0 — Phase 24: Domain Selection & DNS Architecture

**Document:** `DOMAIN_SELECTION_AND_DNS.md`  
**Phase:** 24 of 50 — Public VPS Hosting, Domain Connection, DNS, Nginx, HTTPS & Production Deployment  
**Date:** November 13, 2026  
**Selected Production Domain:** **`griccnexus.com`**  
**Status:** APPROVED BY OPERATOR  

---

## 1. Domain Confirmation: `griccnexus.com`

The operator has selected **`griccnexus.com`** as the official production domain for GRICC 2.0.

### Brand & Intelligence Alignment:
- **Nexus:** Represents a central connection point for geopolitical data streams, crisis alerts, and early-warning telemetry.
- **Top-Level Domain:** `.com` (Gold standard for international trust, global accessibility, and defense intelligence reliability).
- **DNS Status:** Verified unallocated and available for immediate registrar acquisition.

---

## 2. Recommended Registrar & DNS Architecture

### 2.1 Registrar Registration
- **Recommended Registrars:** [Namecheap](https://www.namecheap.com), [Porkbun](https://porkbun.com), or [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/).
- **Annual Cost:** ~$9.98 – $11.98 USD / year (~₹850 – ₹1,020 INR / year).
- **Privacy:** Free lifetime WHOIS privacy protection enabled.

### 2.2 DNS & Edge Protection via Cloudflare (Free Plan)
- **Nameserver Delegation:** Delegate registrar nameservers to Cloudflare.
- **DDoS Mitigation:** Unmetered L3/L4/L7 volumetric attack protection.
- **Anycast DNS:** Global DNS resolution in < 5 milliseconds.
- **Universal Edge SSL:** Seamless TLS edge termination with Let's Encrypt origin certificate.

### 2.3 Required Production DNS Record Layout

Once the DigitalOcean Droplet is launched and the Public IPv4 address is assigned:

```
Type   Name           Content                 Proxy Status         TTL
A      @              <VPS_PUBLIC_IPV4>       DNS Only (initially) Auto
A      api            <VPS_PUBLIC_IPV4>       DNS Only (initially) Auto
CNAME  www            griccnexus.com          DNS Only (initially) Auto
```

*(Note: In Cloudflare, keep Proxy Status set to **DNS Only (Grey Cloud)** during the initial Let's Encrypt Certbot challenge; switch to **Proxied (Orange Cloud)** once HTTPS is verified).*
