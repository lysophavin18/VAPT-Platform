# 🛡️ VAPT Platform - Production-Ready Vulnerability Assessment & Penetration Testing

<div align="center">

![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-required-blue)
![Python](https://img.shields.io/badge/python-3.11+-yellow)

**Enterprise-grade security testing platform with automated scanning, multi-tool integration, and comprehensive reporting**

*Designed by SOPHAVIN LY*

</div>

---

## 🌟 Features

### 🔒 Security & Access Control
- **Role-Based Access Control (RBAC)**: Admin, Manager, Analyst, Viewer roles
- **Approval Workflow**: Aggressive scans require manager authorization
- **Comprehensive Audit Logging**: Track all user actions with IP and timestamps
- **JWT Authentication**: Access and refresh token pattern
- **MFA Support**: TOTP-based two-factor authentication
- **Rate Limiting**: API and login endpoint protection

### 🔍 Scan Capabilities
- **Scan Profiles**: Quick (15-30min), Full (1-2hrs), Aggressive (2-4hrs), Custom
- **Tool Chaining**: Intelligent workflow (Nmap → Nuclei templates, Katana → SQLmap)
- **Target Validation**: IP/CIDR/Domain/URL validation with internal IP blocking
- **Scheduled Scans**: Cron-based automated scanning
- **Real-time Progress**: WebSocket-based live updates

### 🛠️ Integrated Security Tools
| Category | Tools |
|----------|-------|
| **Reconnaissance** | Nmap, Katana, Gobuster, Dirb |
| **Vulnerability Scanning** | Nuclei, Nikto, OWASP ZAP, WPScan |
| **Exploitation Testing** | SQLMap, Hydra, Metasploit (simulation) |
| **API Testing** | Newman (Postman) |

### 📊 Reporting & Analytics
- **Multi-format Reports**: PDF, HTML, DOCX, JSON
- **Executive & Technical Views**: Tailored for different audiences
- **CVE/CVSS Mapping**: Automatic vulnerability classification
- **Dashboard Analytics**: Vulnerability trends, scan statistics
- **Risk Scoring**: Automated risk calculation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VAPT Platform v2.0                           │
│                       Designed by VINNZz                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐                                                   │
│  │    Nginx     │  ◀── WAF, Rate Limiting, SSL Termination         │
│  │   (Reverse   │                                                   │
│  │    Proxy)    │                                                   │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │   Frontend   │     │   Backend    │     │  PostgreSQL  │        │
│  │   React 18   │────▶│   FastAPI    │────▶│     15       │        │
│  │  TypeScript  │     │   Python     │     │              │        │
│  │   Vite 5     │     │    3.11      │     └──────────────┘        │
│  └──────────────┘     └──────┬───────┘                              │
│                              │                                      │
│                              ▼                                      │
│                       ┌──────────────┐     ┌──────────────┐        │
│                       │    Redis     │◀───▶│   Celery     │        │
│                       │   (Broker)   │     │   Workers    │        │
│                       └──────────────┘     └──────┬───────┘        │
│                                                   │                 │
│  ┌────────────────────────────────────────────────┴───────────────┐│
│  │                  Security Tools Network (Isolated)             ││
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       ││
│  │  │ Nmap │ │Nikto │ │Nuclei│ │ ZAP  │ │SQLMap│ │Hydra │       ││
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘       ││
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       ││
│  │  │ Dirb │ │Katana│ │WPScan│ │Newman│ │MSF   │ │Gobust│       ││
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘       ││
│  └────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose v2.x
- 16GB RAM minimum (32GB recommended)
- 50GB disk space
- Linux host (Ubuntu 22.04+ recommended)

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/vapt-platform.git
cd vapt-platform

# Create environment file
cp env.example .env

# Generate secure secrets
sed -i "s/CHANGE_ME_SECURE_PASSWORD_123/$(openssl rand -hex 16)/" .env
sed -i "s/CHANGE_ME_GENERATE_SECURE_SECRET_KEY_WITH_OPENSSL/$(openssl rand -hex 32)/" .env

# Generate SSL certificates (development)
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/key.pem \
    -out nginx/ssl/cert.pem \
    -subj "/CN=localhost"

# Launch platform (development)
docker compose up -d

# Launch platform (production)
docker compose -f docker-compose.production.yml up -d
```

### Access

| Service | URL |
|---------|-----|
| Web UI | https://localhost |
| API Docs | https://localhost/docs |
| Flower Monitor | https://localhost/flower |

### Default Credentials

```
Email: admin@vapt.local
Password: AdminSecure2024!
```

⚠️ **Change these immediately after first login!**

---

## 📖 Documentation

- [Architecture Guide](./ARCHITECTURE.md)
- [Quick Start Guide](./QUICK_START.md)
- [API Reference](https://localhost/docs)

---

## 🔐 Security Considerations

### For Production Deployment

1. **Change all default credentials**
2. **Use proper SSL certificates** (Let's Encrypt recommended)
3. **Configure firewall rules** to restrict access
4. **Enable IP whitelisting** for admin endpoints
5. **Review and adjust rate limits** based on your needs
6. **Enable MFA** for all users
7. **Regular security audits** of scan results
8. **Monitor audit logs** for suspicious activity

### Network Isolation

Security tools run in an isolated Docker network (`tools-network`) that:
- Has no external internet access (internal only)
- Can only communicate with the Celery worker
- Prevents accidental scanning of unauthorized targets

---

## 🔧 Configuration

### Scan Profiles

| Profile | Estimated Duration | Tools | Requires Approval |
|---------|-------------------|-------|-------------------|
| Quick | 15-30 minutes | Nmap, Nikto, Gobuster | No |
| Full | 1-2 hours | All passive tools | No |
| Aggressive | 2-4 hours | All including brute-force | Yes |
| Custom | Varies | User-selected | Depends on tools |

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| API General | 30 req/sec |
| Login | 5 req/min |
| Brute-force tools (Hydra) | 10 req/min |
| Directory enumeration | 100 req/min |

---

## 📊 Screenshots

*Coming soon*

---

## 🛣️ Roadmap

- [ ] Kubernetes deployment (Helm charts)
- [ ] SSO integration (SAML, OIDC)
- [ ] Slack/Teams notifications
- [ ] Custom vulnerability templates
- [ ] Compliance reporting (PCI-DSS, OWASP Top 10)
- [ ] API fuzzing integration
- [ ] Cloud asset discovery

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- OWASP for security guidelines
- ProjectDiscovery for Nuclei and Katana
- All open-source security tool maintainers

---

<div align="center">

**Designed and Developed by VINNZz**

*Building secure solutions for a safer digital world*

</div>
