# VAPT Platform - Quick Start Guide
# Designed by VINNZz

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose v2.x
- 16GB RAM minimum (32GB recommended)
- 50GB disk space
- Linux host (Ubuntu 22.04+ recommended)

### 1. Clone and Setup

```bash
cd /path/to/VAPT-Platform

# Create environment file
cp .env.example .env

# Generate secure secrets
openssl rand -hex 32  # Use for JWT_SECRET
openssl rand -hex 32  # Use for POSTGRES_PASSWORD
```

### 2. Configure Environment

Edit `.env` file with your settings:

```env
# Database
POSTGRES_USER=vapt_user
POSTGRES_PASSWORD=<generated-secure-password>
POSTGRES_DB=vapt_platform

# Security
JWT_SECRET=<generated-jwt-secret>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Application
APP_NAME="VAPT Platform"
APP_ENV=production
DEBUG=false
```

### 3. Generate SSL Certificates

For production:
```bash
# Using Let's Encrypt (recommended)
certbot certonly --standalone -d your-domain.com

# Copy certificates
mkdir -p nginx/ssl
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem
```

For development (self-signed):
```bash
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/key.pem \
    -out nginx/ssl/cert.pem \
    -subj "/CN=localhost"
```

### 4. Launch Platform

Development:
```bash
docker compose up -d
```

Production:
```bash
docker compose -f docker-compose.production.yml up -d
```

### 5. Access Platform

- **Web UI**: https://localhost (or your domain)
- **API Docs**: https://localhost/docs
- **Flower (Task Monitor)**: https://localhost/flower

### Default Credentials

```
Email: admin@vapt.local
Password: AdminSecure2024!
```

⚠️ **CHANGE THESE IMMEDIATELY AFTER FIRST LOGIN!**

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      VAPT Platform                          │
│                    Designed by VINNZz                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌─────────┐     ┌─────────┐     ┌─────────────────┐     │
│    │  Nginx  │────▶│ Backend │────▶│   PostgreSQL    │     │
│    │  (WAF)  │     │ FastAPI │     │                 │     │
│    └────┬────┘     └────┬────┘     └─────────────────┘     │
│         │               │                                   │
│         │               ▼                                   │
│         │          ┌─────────┐     ┌─────────────────┐     │
│         │          │  Redis  │◀───▶│  Celery Worker  │     │
│         │          │         │     │                 │     │
│         │          └─────────┘     └────────┬────────┘     │
│         │                                   │               │
│         ▼                                   ▼               │
│    ┌─────────┐              ┌───────────────────────────┐  │
│    │Frontend │              │    Security Tools Network  │  │
│    │  React  │              │  ┌─────┐ ┌─────┐ ┌─────┐  │  │
│    └─────────┘              │  │Nmap │ │Nikto│ │Nuclei│  │  │
│                             │  └─────┘ └─────┘ └─────┘  │  │
│                             │  ┌─────┐ ┌─────┐ ┌─────┐  │  │
│                             │  │ ZAP │ │Hydra│ │SQLmap│  │  │
│                             │  └─────┘ └─────┘ └─────┘  │  │
│                             └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Common Operations

### Viewing Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f celery-worker
```

### Scaling Workers
```bash
docker compose up -d --scale celery-worker=4
```

### Database Backup
```bash
docker compose exec postgres pg_dump -U vapt_user vapt_platform > backup.sql
```

### Update Platform
```bash
git pull
docker compose build --no-cache
docker compose up -d
```

---

## 🔐 Security Features

| Feature | Description |
|---------|-------------|
| RBAC | Admin, Manager, Analyst, Viewer roles |
| Approval Workflow | Aggressive scans require manager approval |
| Audit Logging | All actions logged with IP/User-Agent |
| Rate Limiting | API: 30/s, Login: 5/min |
| JWT Auth | Access + Refresh token pattern |
| MFA Support | TOTP-based two-factor authentication |
| Input Validation | Target validation, command sanitization |
| Network Isolation | Security tools in isolated network |

---

## 📋 Scan Profiles

| Profile | Duration | Tools | Approval |
|---------|----------|-------|----------|
| Quick | 15-30 min | Nmap, Nikto, Gobuster | No |
| Full | 1-2 hours | All passive tools | No |
| Aggressive | 2-4 hours | All + Hydra, Metasploit | Yes |
| Custom | Varies | User-selected | Depends |

---

## 🛠 Integrated Tools

### Reconnaissance
- **Nmap** - Port scanning & service detection
- **Katana** - Web crawling
- **Gobuster/Dirb** - Directory brute-forcing

### Vulnerability Scanning
- **Nuclei** - Template-based scanning
- **Nikto** - Web server scanning
- **OWASP ZAP** - DAST scanning
- **WPScan** - WordPress scanning

### Exploitation Testing
- **SQLMap** - SQL injection
- **Hydra** - Credential brute-forcing
- **Metasploit** - Exploit matching (simulation)

### API Testing
- **Newman** - Postman collection runner

---

## 📞 Support

For issues and feature requests, contact the development team.

**Designed and developed by VINNZz**
