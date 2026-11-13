#!/usr/bin/env bash
# ==============================================================================
# GRICC 2.0 — Production Server Provisioning & Hardening Script
# Target OS: Ubuntu 24.04 LTS (x64)
# Target Datacenter: DigitalOcean Bengaluru (BLR1)
# ==============================================================================

set -euo pipefail

echo "=================================================="
echo "  GRICC 2.0 Production Server Provisioning"
echo "  Date: $(date -u)"
echo "=================================================="

# 1. Update OS Packages
echo "[1/8] Updating Ubuntu system packages..."
apt-get update && apt-get upgrade -y
apt-get install -y curl wget git ufw unattended-upgrades build-essential certbot python3-certbot-nginx fail2ban htop

# 2. Configure Automatic Security Updates
echo "[2/8] Configuring automatic security updates..."
dpkg-reconfigure -f noninteractive unattended-upgrades

# 3. Configure UFW Firewall (Strict Inbound Rules)
echo "[3/8] Configuring UFW Firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (Let Encrypt)'
ufw allow 443/tcp comment 'HTTPS'
# Never expose SQLite, internal node port 5000, or dev ports
ufw --force enable

# 4. Create Dedicated Non-Root Application User
echo "[4/8] Creating dedicated application user 'gricc'..."
if id "gricc" &>/dev/null; then
    echo "User 'gricc' already exists."
else
    useradd -m -s /bin/bash gricc
    usermod -aG sudo gricc
    echo "User 'gricc' created."
fi

# 5. Install Node.js 24 LTS via NodeSource
echo "[5/8] Installing Node.js 24 LTS..."
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# 6. Install Global Production Tools (PM2)
echo "[6/8] Installing PM2 process supervisor..."
npm install -g pm2
pm2 startup systemd -u gricc --hp /home/gricc

# 7. Setup Directory Hierarchy
echo "[7/8] Creating production application directories..."
mkdir -p /var/www/gricc
mkdir -p /var/www/certbot
mkdir -p /var/log/gricc
chown -R gricc:gricc /var/www/gricc
chown -R gricc:gricc /var/log/gricc

# 8. Configure Fail2Ban for SSH Protection
echo "[8/8] Enabling Fail2Ban..."
systemctl enable fail2ban
systemctl start fail2ban

echo "=================================================="
echo "  Server Provisioning Complete!"
echo "  Next: Deploy application code and obtain TLS cert."
echo "=================================================="

