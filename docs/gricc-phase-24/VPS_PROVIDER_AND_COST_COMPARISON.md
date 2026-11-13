# GRICC 2.0 — Phase 24: VPS Provider & Cost Analysis

**Document:** `VPS_PROVIDER_AND_COST_COMPARISON.md`  
**Phase:** 24 of 50 — Public VPS Hosting, Domain Connection, DNS, Nginx, HTTPS & Production Deployment  
**Date:** November 13, 2026  
**Status:** PENDING USER APPROVAL (APPROVAL GATE 1)  

---

## 1. Objective & Provider Evaluation

To ensure low latency for operations centered in the South Asian and Indian Ocean theatre while maintaining high-speed global connectivity, the preferred VPS provider is **DigitalOcean** in the **Bengaluru (BLR1), India** datacenter.

---

## 2. Server Configuration Comparison

| Specification | Option 1: Primary Target (Recommended) | Option 2: Scaled Baseline (Cost-Optimized) |
| :--- | :--- | :--- |
| **Droplet Plan** | Basic Shared CPU (4 vCPU / 8 GB) | Basic Shared CPU (2 vCPU / 4 GB) |
| **vCPU Cores** | 4 vCPUs | 2 vCPUs |
| **RAM** | 8 GB RAM | 4 GB RAM |
| **SSD Storage** | 160 GB SSD | 80 GB SSD |
| **Bandwidth** | 5,000 GiB / month transfer | 4,000 GiB / month transfer |
| **Region** | Bengaluru, India (`BLR1`) | Bengaluru, India (`BLR1`) |
| **Operating System** | Ubuntu 24.04 LTS (x64) | Ubuntu 24.04 LTS (x64) |
| **Base Monthly Cost** | $48.00 / month | $24.00 / month |
| **Automated Backups (+20%)**| $9.60 / month | $4.80 / month |
| **Subtotal (USD)** | $57.60 / month | $28.80 / month |
| **Integrated GST (18% in India)**| $10.37 / month | $5.18 / month |
| **Total Monthly Cost (USD)** | **$67.97 / month** | **$33.98 / month** |
| **Est. Monthly Cost (INR @ ₹85/USD)**| **~₹5,777 / month** | **~₹2,888 / month** |
| **Est. Annual Cost (INR)** | **~₹69,324 / year** | **~₹34,656 / year** |

---

## 3. Workload Sizing Justification

- **Option 1 (4 vCPU / 8 GB RAM - $48/mo):** Ideal for sustained production workloads running Node.js Express 5, React production Nginx static serving, Better-SQLite3 WAL cache (~32 MB page cache), Server-Sent Events (up to 500 concurrent subscribers), and background cron analytics tasks.
- **Option 2 (2 vCPU / 4 GB RAM - $24/mo):** Sufficient for staging, pilot deployment, and low-to-medium initial traffic. DigitalOcean allows seamless droplet resizing (CPU/RAM upgrades take < 2 minutes with zero data loss).

---

## 4. Disaster Recovery & Snapshot Policy

- **DigitalOcean Automated Backups:** Weekly full disk images retained for 4 weeks ($9.60/mo on Option 1).
- **GRICC Internal Backups:** Local AES-256-GCM encrypted database backups (`.db.enc`) taken daily and retained on disk with Scrypt key custody.

