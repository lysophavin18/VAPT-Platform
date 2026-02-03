# VAPT Platform

A comprehensive Vulnerability Assessment and Penetration Testing (VAPT) platform with Docker orchestration, modern web interface, and integration with industry-standard security tools.

## 🚀 Features

- **Web Dashboard**: Modern React-based interface with real-time scan monitoring
- **Project Management**: Organize assessments by projects with targets and scans
- **Multi-Tool Integration**: Nmap, Nikto, Nuclei, OWASP ZAP, SQLMap, Gobuster, Katana, WPScan, Hydra, Metasploit
- **Vulnerability Tracking**: Centralized vulnerability management with severity classification
- **Report Generation**: PDF, HTML, DOCX, and JSON report formats
- **Task Queue**: Celery-based background job processing for long-running scans
- **User Management**: Role-based access control (Admin, Analyst, Viewer)
- **Scheduled Scans**: Cron-based automated scanning capabilities

## 📋 Prerequisites

- Docker Engine 24.0+
- Docker Compose 2.0+
- 8GB RAM minimum (16GB recommended)
- 50GB disk space

## 🛠️ Quick Start

### 1. Clone and Configure

```bash
# Navigate to VAPT-Platform directory
cd VAPT-Platform

# Copy environment file
cp .env.example .env

# Edit .env file with your settings
nano .env
```

### 2. Build and Start

```bash
# Build all containers
docker-compose build

# Start the platform
docker-compose up -d

# Check service status
docker-compose ps
```

### 3. Access the Platform

| Service | URL | Description |
|---------|-----|-------------|
| Web Interface | http://localhost | Main dashboard |
| API Documentation | http://localhost/api/docs | Swagger UI |
| Flower (Task Monitor) | http://localhost/flower | Celery monitoring |

### Default Credentials

- **Email**: admin@vapt.local
- **Password**: AdminSecure2024!

⚠️ **Change these immediately in production!**

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       NGINX (Reverse Proxy)                 │
│                         Port 80/443                         │
└─────────────────┬───────────────────────┬───────────────────┘
                  │                       │
    ┌─────────────▼─────────────┐   ┌─────▼─────────────────┐
    │     React Frontend        │   │    FastAPI Backend    │
    │      (Port 3000)          │   │      (Port 8000)      │
    └───────────────────────────┘   └──────────┬────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
          ┌─────────▼─────────┐    ┌───────────▼───────────┐   ┌─────────▼─────────┐
          │    PostgreSQL     │    │        Redis          │   │   Celery Workers  │
          │    (Port 5432)    │    │     (Port 6379)       │   │   + Beat + Flower │
          └───────────────────┘    └───────────────────────┘   └─────────┬─────────┘
                                                                         │
                    ┌────────────────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┬───────────────┬───────────────┐
    │               │               │               │               │
┌───▼───┐       ┌───▼───┐       ┌───▼───┐       ┌───▼───┐       ┌───▼───┐
│ Nmap  │       │ Nikto │       │Nuclei │       │  ZAP  │       │SQLMap │
└───────┘       └───────┘       └───────┘       └───────┘       └───────┘
```

## 📁 Project Structure

```
VAPT-Platform/
├── docker-compose.yml          # Main orchestration file
├── .env.example                 # Environment template
├── backend/
│   ├── Dockerfile
│   ├── main.py                  # FastAPI application
│   ├── config.py                # Configuration settings
│   ├── database.py              # Database connection
│   ├── models.py                # SQLAlchemy models
│   ├── schemas.py               # Pydantic schemas
│   ├── report_generator.py      # Report generation module
│   ├── routers/
│   │   ├── auth.py              # Authentication endpoints
│   │   ├── users.py             # User management
│   │   ├── projects.py          # Project CRUD
│   │   ├── targets.py           # Target management
│   │   ├── scans.py             # Scan operations
│   │   ├── vulnerabilities.py   # Vulnerability management
│   │   ├── reports.py           # Report generation
│   │   └── dashboard.py         # Dashboard statistics
│   └── orchestrator/
│       └── celery_app.py        # Celery tasks for scans
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx              # Main React app
│   │   ├── api/client.ts        # API client
│   │   ├── store/authStore.ts   # Auth state management
│   │   ├── components/
│   │   │   └── Layout.tsx       # Main layout
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Dashboard.tsx
│   │       ├── Projects.tsx
│   │       ├── Scans.tsx
│   │       ├── Vulnerabilities.tsx
│   │       ├── Reports.tsx
│   │       └── Settings.tsx
│   └── tailwind.config.js
├── nginx/
│   └── nginx.conf               # Reverse proxy config
├── database/
│   └── init.sql                 # Database initialization
├── tools/
│   ├── sqlmap/Dockerfile
│   ├── nikto/Dockerfile
│   ├── gobuster/Dockerfile
│   └── hydra/Dockerfile
└── wordlists/
    ├── common.txt
    ├── users.txt
    └── passwords.txt
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | VAPTSecure2024! | Database password |
| `SECRET_KEY` | (generated) | JWT signing key |
| `MAX_CONCURRENT_SCANS` | 5 | Max parallel scans |
| `SCAN_TIMEOUT_SECONDS` | 3600 | Default scan timeout |

### Scan Types

| Type | Description | Tools Used |
|------|-------------|------------|
| `port_scan` | Port and service discovery | Nmap |
| `web_scan` | Web vulnerability scanning | Nikto, Nuclei |
| `sql_injection` | SQL injection testing | SQLMap |
| `directory_enum` | Directory enumeration | Gobuster |
| `crawl` | Web crawling | Katana |
| `wordpress` | WordPress security scan | WPScan |
| `brute_force` | Credential testing | Hydra |
| `full_scan` | Comprehensive assessment | All tools |

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh token

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project details
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

### Scans
- `POST /api/scans` - Create and start scan
- `GET /api/scans/{id}` - Get scan status
- `POST /api/scans/{id}/stop` - Stop running scan
- `GET /api/scans/{id}/results` - Get scan results

### Vulnerabilities
- `GET /api/vulnerabilities` - List vulnerabilities
- `POST /api/vulnerabilities/{id}/verify` - Verify vulnerability
- `POST /api/vulnerabilities/{id}/false-positive` - Mark as false positive

### Reports
- `POST /api/reports/generate` - Generate report
- `GET /api/reports/{id}/download` - Download report

## 🔒 Security Considerations

1. **Change Default Credentials**: Update admin password immediately
2. **Use HTTPS**: Configure SSL certificates for production
3. **Network Isolation**: Run scans from isolated network
4. **Access Control**: Implement proper RBAC
5. **Audit Logging**: All actions are logged
6. **Rate Limiting**: API rate limiting enabled

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild specific service
docker-compose build backend

# Scale workers
docker-compose up -d --scale celery-worker=3

# Access database
docker-compose exec postgres psql -U vapt_user -d vapt_platform
```

## 🧪 Development

### Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

## 📝 License

This project is for authorized security testing only. Ensure you have proper authorization before scanning any targets.

## ⚠️ Disclaimer

This tool is intended for authorized security testing and educational purposes only. Unauthorized access to computer systems is illegal. Always obtain proper authorization before conducting security assessments.
