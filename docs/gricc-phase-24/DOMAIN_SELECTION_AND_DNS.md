# GRICC 2.0 — Phase 24: Domain Selection & DNS Architecture

**Document:** `DOMAIN_SELECTION_AND_DNS.md`  
**Phase:** 24 of 50 — Public VPS Hosting, Domain Connection, DNS, Nginx, HTTPS & Production Deployment  
**Date:** November 13, 2026  
**Status:** PENDING USER APPROVAL (APPROVAL GATE 1)  

---

## 1. Domain Availability & Candidacy Analysis

An independent WHOIS and registrar search was performed for `.com` candidate domains:

| Candidate Domain | Current Status | Suitability & Branding Analysis | Estimated 1st Year Cost | Renewal / Year |
| :--- | :--- | :--- | :--- | :--- |
| **`gricc.com`** | **UNAVAILABLE (Registered)** | Owned by a third-party organization with active DNS. Requires acquisition or negotiation. | N/A | N/A |
| **`griccglobal.com`** | **AVAILABLE** | **Strongest Recommendation.** Professional, concise, directly aligns with "Global Risk, Intelligence & Conflict Center". | ~$9.98 – $11.98 | ~$14.98 |
| **`griccintelligence.com`** | **AVAILABLE** | Highly descriptive, industry-standard for intelligence platforms. | ~$9.98 – $11.98 | ~$14.98 |
| **`thegricc.com`** | **AVAILABLE** | Brandable alternative, colloquial. | ~$9.98 – $11.98 | ~$14.98 |

---

## 2. Recommended Registrar & DNS Architecture

### 2.1 Registrar Recommendation
- **Registrar:** **Namecheap** or **Porkbun** for initial registration with free lifetime WHOIS privacy protection.
- **Cost:** ~$10.00 – $12.00 USD / year (~₹850 – ₹1,020 INR / year).

### 2.2 DNS & Edge Protection: Cloudflare (Free Plan)
- **Nameservers:** Delegate registrar nameservers to Cloudflare.
- **DDoS Mitigation:** Cloudflare unmetered L3/L4/L7 DDoS protection.
- **Anycast DNS:** Global DNS propagation in < 5 seconds.
- **Edge SSL & HSTS:** Automatic HTTPS termination at the edge with Let's Encrypt origin certificate (Full Strict SSL).

### 2.3 Proposed Production DNS Record Layout

```
Type   Name           Content                 Proxy Status   TTL
A      @              <VPS_PUBLIC_IPV4>       DNS Only (init) Auto
A      api            <VPS_PUBLIC_IPV4>       DNS Only (init) Auto
CNAME  www            griccglobal.com         DNS Only (init) Auto
```
*(Proxy mode `Proxied` is enabled only after Let's Encrypt HTTP-01 challenge is completed on origin).*

