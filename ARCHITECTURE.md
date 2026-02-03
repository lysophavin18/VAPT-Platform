# VAPT Platform - System Architecture

**Designed by VINNZz**
**Version: 2.0 Production**

## 🏗️ High-Level Architecture Diagram

```
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                    VAPT PLATFORM v2.0                       │
                                    │                   Production Architecture                    │
                                    │                      by VINNZz                              │
                                    └─────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
    │                                           PRESENTATION LAYER                                            │
    │  ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
    │  │                                    NGINX (Reverse Proxy + WAF)                                     │ │
    │  │                                      Port 80/443 (SSL/TLS)                                         │ │
    │  │                         Rate Limiting • Security Headers • Load Balancing                          │ │
    │  └────────────────────────────────────────┬───────────────────────────────────────────────────────────┘ │
    │                                           │                                                             │
    │              ┌────────────────────────────┴────────────────────────────┐                                │
    │              │                                                         │                                │
    │  ┌───────────▼──────────────┐                              ┌───────────▼──────────────┐                 │
    │  │    REACT FRONTEND        │                              │    API DOCUMENTATION     │                 │
    │  │    (Port 3000)           │                              │    Swagger/OpenAPI       │                 │
    │  │                          │                              │    /api/docs             │                 │
    │  │  • Login/Auth UI         │                              └──────────────────────────┘                 │
    │  │  • Dashboard             │                                                                           │
    │  │  • Target Input          │                                                                           │
    │  │  • Scan Management       │                                                                           │
    │  │  • Reports               │                                                                           │
    │  │  • Admin Panel           │                                                                           │
    │  └──────────────────────────┘                                                                           │
    └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
    │                                            APPLICATION LAYER                                            │
    │                                                                                                         │
    │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐   │
    │  │                               FASTAPI BACKEND (Port 8000)                                        │   │
    │  │                                                                                                  │   │
    │  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │   │
    │  │  │  Auth Service   │  │  Scan Service   │  │ Report Service  │  │  Admin Service  │             │   │
    │  │  │                 │  │                 │  │                 │  │                 │             │   │
    │  │  │ • JWT Auth      │  │ • Target Valid. │  │ • PDF Gen       │  │ • User Mgmt     │             │   │
    │  │  │ • RBAC          │  │ • Scan Queue    │  │ • HTML Export   │  │ • Audit Logs    │             │   │
    │  │  │ • Sessions      │  │ • Approval Flow │  │ • CVSS Mapping  │  │ • System Config │             │   │
    │  │  │ • MFA (opt)     │  │ • Progress      │  │ • Exec Summary  │  │ • Tool Config   │             │   │
    │  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘             │   │
    │  │                                                                                                  │   │
    │  │  ┌─────────────────────────────────────────────────────────────────────────────────────────┐    │   │
    │  │  │                            SCAN ORCHESTRATOR ENGINE                                      │    │   │
    │  │  │                                                                                          │    │   │
    │  │  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │    │   │
    │  │  │   │ Quick Scan   │    │ Full Scan    │    │ Aggressive   │    │ Custom Scan  │          │    │   │
    │  │  │   │ Profile      │    │ Profile      │    │ Profile      │    │ Profile      │          │    │   │
    │  │  │   └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘          │    │   │
    │  │  │                                                                                          │    │   │
    │  │  │   ┌──────────────────────────────────────────────────────────────────────────┐          │    │   │
    │  │  │   │                        TOOL CHAINING ENGINE                               │          │    │   │
    │  │  │   │                                                                           │          │    │   │
    │  │  │   │   Nmap → Service Detection → Nuclei Templates                            │          │    │   │
    │  │  │   │   Katana → URLs → SQLmap / ZAP                                           │          │    │   │
    │  │  │   │   WPScan → WordPress Vulns → Exploit Matching                            │          │    │   │
    │  │  │   │   Gobuster → Directories → Nikto Specific Paths                          │          │    │   │
    │  │  │   └──────────────────────────────────────────────────────────────────────────┘          │    │   │
    │  │  └─────────────────────────────────────────────────────────────────────────────────────────┘    │   │
    │  └─────────────────────────────────────────────────────────────────────────────────────────────────┘   │
    │                                                                                                         │
    │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐   │
    │  │                              CELERY WORKERS (Distributed Task Queue)                             │   │
    │  │                                                                                                  │   │
    │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │   │
    │  │  │  Worker 1   │  │  Worker 2   │  │  Worker 3   │  │  Worker N   │  │ Beat Sched. │            │   │
    │  │  │ (Web Scans) │  │ (Network)   │  │ (API Scans) │  │ (Scalable)  │  │ (Cron Jobs) │            │   │
    │  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘            │   │
    │  │                                                                                                  │   │
    │  │  Flower Monitoring: http://localhost:5555                                                        │   │
    │  └─────────────────────────────────────────────────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
    │                                              DATA LAYER                                                 │
    │                                                                                                         │
    │  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐                  │
    │  │      POSTGRESQL         │  │         REDIS           │  │    FILE STORAGE         │                  │
    │  │      (Port 5432)        │  │      (Port 6379)        │  │                         │                  │
    │  │                         │  │                         │  │  • Reports (/reports)   │                  │
    │  │  • Users                │  │  • Scan Queue           │  │  • Uploads (/uploads)   │                  │
    │  │  • Projects             │  │  • Task Results         │  │  • Wordlists            │                  │
    │  │  • Targets              │  │  • Session Cache        │  │  • Tool Output          │                  │
    │  │  • Scans                │  │  • Rate Limit State     │  │  • Scan Artifacts       │                  │
    │  │  • Vulnerabilities      │  │  • Real-time Updates    │  │                         │                  │
    │  │  • Reports              │  │                         │  │                         │                  │
    │  │  • Audit Logs           │  │                         │  │                         │                  │
    │  └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘                  │
    └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
    │                                      SECURITY TOOLS LAYER (Isolated Network)                            │
    │                                                                                                         │
    │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐   │
    │  │                                   WEB PENTESTING TOOLS                                           │   │
    │  │                                                                                                  │   │
    │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │   │
    │  │  │  NMAP   │ │  NIKTO  │ │ GOBUSTER│ │  DIRB   │ │ NUCLEI  │ │ KATANA  │ │ WPSCAN  │           │   │
    │  │  │ 256MB   │ │ 256MB   │ │ 128MB   │ │ 128MB   │ │ 512MB   │ │ 256MB   │ │ 256MB   │           │   │
    │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘           │   │
    │  │                                                                                                  │   │
    │  │  ┌─────────┐ ┌─────────┐ ┌─────────────────────────────────────────────┐                        │   │
    │  │  │ SQLMAP  │ │  HYDRA  │ │              OWASP ZAP (Headless)           │                        │   │
    │  │  │ 256MB   │ │ 128MB   │ │                    1GB                       │                        │   │
    │  │  │ RateLtd │ │ RateLtd │ │                 Port: 8090                   │                        │   │
    │  │  └─────────┘ └─────────┘ └─────────────────────────────────────────────┘                        │   │
    │  └─────────────────────────────────────────────────────────────────────────────────────────────────┘   │
    │                                                                                                         │
    │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐   │
    │  │                                   API PENTESTING TOOLS                                           │   │
    │  │                                                                                                  │   │
    │  │  ┌─────────────────────────────────────┐  ┌─────────────────────────────────────┐               │   │
    │  │  │           POSTMAN/NEWMAN            │  │          BURP SUITE (API)           │               │   │
    │  │  │              256MB                  │  │              512MB                   │               │   │
    │  │  │        API Testing Runner           │  │          Headless Scanner            │               │   │
    │  │  └─────────────────────────────────────┘  └─────────────────────────────────────┘               │   │
    │  └─────────────────────────────────────────────────────────────────────────────────────────────────┘   │
    │                                                                                                         │
    │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐   │
    │  │                                 EXPLOITATION TOOLS (Isolated)                                    │   │
    │  │                                                                                                  │   │
    │  │  ┌─────────────────────────────────────────────────────────────────────────────────────────┐    │   │
    │  │  │                          METASPLOIT FRAMEWORK (Simulation Only)                          │    │   │
    │  │  │                                        2GB                                               │    │   │
    │  │  │                            Exploit Matching • CVE Lookup                                  │    │   │
    │  │  │                          ⚠️ DESTRUCTIVE ACTIONS DISABLED                                 │    │   │
    │  │  └─────────────────────────────────────────────────────────────────────────────────────────┘    │   │
    │  └─────────────────────────────────────────────────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

                                        INTERNAL DOCKER NETWORK ONLY
                                      (vapt-network - No Public Exposure)
```

## 🔄 Scan Orchestration Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              SCAN ORCHESTRATION FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │  User Login  │
     │   (JWT)      │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐      ┌──────────────────────────────────────────┐
     │ Target Input │      │ Validation Rules:                        │
     │              │ ───► │ • IP format check                        │
     │ • IP/Domain  │      │ • Domain resolution                      │
     │ • URL        │      │ • CIDR range limit (max /24)             │
     │ • API        │      │ • Blacklist check (internal IPs blocked) │
     └──────┬───────┘      └──────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐
     │  Scan Type   │
     │  Selection   │
     │              │
     │ • Web        │
     │ • API        │
     │ • Network    │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐      ┌──────────────────────────────────────────┐
     │ Scan Profile │      │ Profiles:                                │
     │  Selection   │ ───► │                                          │
     │              │      │ QUICK:     Nmap, Nikto, Nuclei (15 min)  │
     │ • Quick      │      │ FULL:      All tools, thorough (2 hrs)   │
     │ • Full       │      │ AGGRESSIVE: Deep scan, bruteforce (4hrs) │
     │ • Aggressive │      │ CUSTOM:    User-selected tools           │
     │ • Custom     │      │                                          │
     └──────┬───────┘      └──────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐
     │   Tool       │
     │  Selection   │
     │  (Enable/    │
     │   Disable)   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐                    ┌──────────────┐
     │   Backend    │    RBAC Check      │   Approval   │
     │  Validation  │───────────────────►│   Required?  │
     └──────┬───────┘                    └──────┬───────┘
            │                                    │
            │           ┌────────────────────────┤
            │           │ Yes (Aggressive/External)
            │           ▼                        │ No
            │    ┌──────────────┐                │
            │    │   Manager    │                │
            │    │   Approval   │                │
            │    └──────┬───────┘                │
            │           │                        │
            │◄──────────┴────────────────────────┘
            ▼
     ┌──────────────┐
     │  Scan Job    │
     │   Created    │
     │              │
     │ • UUID       │
     │ • Status     │
     │ • Audit Log  │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐      ┌──────────────────────────────────────────┐
     │   Queued     │      │ Queue Management:                        │
     │  in Redis    │ ───► │ • Max 5 concurrent scans                 │
     │              │      │ • Priority levels (high/normal/low)      │
     │              │      │ • Resource-aware scheduling              │
     └──────┬───────┘      └──────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐
     │ Orchestrator │
     │   Executes   │
     │    Tools     │
     │              │
     │ (Parallel/   │
     │  Chained)    │
     └──────┬───────┘
            │
            ├──────────────────────────────────────────────────────────┐
            │                                                          │
            ▼                                                          ▼
     ┌──────────────┐                                          ┌──────────────┐
     │  Tool Output │                                          │  Real-time   │
     │  Collected   │                                          │   Progress   │
     │              │                                          │   Updates    │
     │ • JSON       │                                          │  (WebSocket) │
     │ • XML        │                                          └──────────────┘
     │ • Raw Text   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐      ┌──────────────────────────────────────────┐
     │Normalization │      │ Processing:                              │
     │  & Parsing   │ ───► │ • Deduplicate findings                   │
     │              │      │ • Correlate across tools                 │
     │              │      │ • Validate false positives               │
     └──────┬───────┘      └──────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐      ┌──────────────────────────────────────────┐
     │ CVE Mapping  │      │ Enrichment:                              │
     │ CVSS Scoring │ ───► │ • NVD database lookup                    │
     │              │      │ • CVSS v3.1 calculation                  │
     │              │      │ • Exploit-DB reference                   │
     └──────┬───────┘      └──────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐      ┌──────────────────────────────────────────┐
     │  Risk Score  │      │ Calculation:                             │
     │ Calculation  │ ───► │ Score = Σ(Severity × Impact × Likelihood)│
     │              │      │ Critical=10, High=7, Medium=4, Low=1     │
     └──────┬───────┘      └──────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐
     │  Dashboard   │
     │   Update     │
     │              │
     │ • Charts     │
     │ • Metrics    │
     │ • Alerts     │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │    PDF       │
     │   Report     │
     │  Generated   │
     │              │
     │ • Executive  │
     │ • Technical  │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │  Stored in   │
     │  Database    │
     │              │
     │ • Vulns      │
     │ • Reports    │
     │ • Audit Log  │
     └──────────────┘
```

## 🔒 Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              SECURITY ARCHITECTURE                                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘

AUTHENTICATION & AUTHORIZATION
├── JWT Token-based Auth
│   ├── Access Token (30 min expiry)
│   ├── Refresh Token (7 days expiry)
│   └── Token blacklisting on logout
│
├── Role-Based Access Control (RBAC)
│   ├── ADMIN    → Full access, user management, system config
│   ├── MANAGER  → Approve scans, view all projects, reports
│   ├── ANALYST  → Create scans, view assigned projects
│   └── VIEWER   → Read-only dashboard access
│
└── Session Management
    ├── Secure cookies (HttpOnly, Secure, SameSite)
    ├── Session timeout (configurable)
    └── Concurrent session limits

INPUT VALIDATION
├── Target Validation
│   ├── IP format validation (IPv4/IPv6)
│   ├── Domain resolution check
│   ├── CIDR range limiting (max /24)
│   └── Internal IP blocking (10.x, 172.16.x, 192.168.x)
│
├── SQL Injection Prevention
│   ├── Parameterized queries (SQLAlchemy ORM)
│   └── Input sanitization
│
└── XSS Prevention
    ├── Output encoding
    ├── Content Security Policy headers
    └── React's built-in XSS protection

NETWORK SECURITY
├── Internal Docker Network
│   ├── No public exposure for tools
│   ├── Backend-only tool communication
│   └── Network segmentation
│
├── NGINX WAF Features
│   ├── Rate limiting (API: 30/s, Login: 5/min)
│   ├── Request size limits
│   ├── Security headers
│   └── SSL/TLS termination
│
└── Container Isolation
    ├── Resource limits (CPU, Memory)
    ├── No privileged containers
    ├── Read-only filesystems where possible
    └── Dropped capabilities

AUDIT & COMPLIANCE
├── Activity Logging
│   ├── All user actions logged
│   ├── Scan execution logs
│   ├── Configuration changes
│   └── Authentication events
│
├── Data Protection
│   ├── Passwords hashed (bcrypt)
│   ├── Sensitive data encrypted at rest
│   └── TLS for data in transit
│
└── Compliance Features
    ├── Data retention policies
    ├── Export capabilities
    └── Access reports
```

## 📊 Database Schema

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  DATABASE SCHEMA                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│       USERS          │       │      PROJECTS        │       │       TARGETS        │
├──────────────────────┤       ├──────────────────────┤       ├──────────────────────┤
│ id (UUID) PK         │       │ id (UUID) PK         │       │ id (UUID) PK         │
│ email (unique)       │       │ name                 │       │ project_id FK        │
│ hashed_password      │       │ description          │       │ name                 │
│ full_name            │       │ project_type         │       │ target_type          │
│ role (enum)          │       │ status               │       │ host                 │
│ is_active            │       │ owner_id FK          │       │ port                 │
│ created_at           │◄──────│ start_date           │◄──────│ url                  │
│ updated_at           │   1:N │ end_date             │   1:N │ is_active            │
│ last_login           │       │ created_at           │       │ created_at           │
│ mfa_enabled          │       │ updated_at           │       │ updated_at           │
└──────────────────────┘       └──────────────────────┘       └──────────────────────┘
                                        │
                                        │ 1:N
                                        ▼
┌──────────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│       SCANS          │       │   VULNERABILITIES    │       │       REPORTS        │
├──────────────────────┤       ├──────────────────────┤       ├──────────────────────┤
│ id (UUID) PK         │       │ id (UUID) PK         │       │ id (UUID) PK         │
│ project_id FK        │       │ scan_id FK           │       │ project_id FK        │
│ target_id FK         │       │ project_id FK        │       │ title                │
│ scan_type            │       │ title                │       │ report_type          │
│ scan_profile         │◄──────│ description          │       │ format               │
│ status               │   1:N │ severity             │       │ status               │
│ enabled_tools (JSON) │       │ status               │       │ file_path            │
│ started_at           │       │ cve_id               │       │ created_at           │
│ completed_at         │       │ cvss_score           │       │ created_by FK        │
│ created_by FK        │       │ affected_url         │       └──────────────────────┘
│ approved_by FK       │       │ affected_parameter   │
│ approval_status      │       │ remediation          │
│ celery_task_id       │       │ proof_of_concept     │
│ results (JSONB)      │       │ found_by_tool        │
│ created_at           │       │ false_positive       │
└──────────────────────┘       │ verified             │
         │                     │ created_at           │
         │ 1:N                 └──────────────────────┘
         ▼
┌──────────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│    SCAN_RESULTS      │       │     AUDIT_LOGS       │       │  SCHEDULED_SCANS     │
├──────────────────────┤       ├──────────────────────┤       ├──────────────────────┤
│ id (UUID) PK         │       │ id (UUID) PK         │       │ id (UUID) PK         │
│ scan_id FK           │       │ user_id FK           │       │ project_id FK        │
│ tool_name            │       │ action               │       │ target_id FK         │
│ status               │       │ resource_type        │       │ scan_type            │
│ raw_output (TEXT)    │       │ resource_id          │       │ scan_profile         │
│ parsed_output (JSON) │       │ old_value (JSONB)    │       │ enabled_tools (JSON) │
│ findings_count       │       │ new_value (JSONB)    │       │ cron_expression      │
│ started_at           │       │ ip_address           │       │ is_active            │
│ completed_at         │       │ user_agent           │       │ last_run             │
│ error_message        │       │ created_at           │       │ next_run             │
└──────────────────────┘       └──────────────────────┘       └──────────────────────┘

┌──────────────────────┐       ┌──────────────────────┐
│   SCAN_APPROVALS     │       │   TOOL_CONFIGS       │
├──────────────────────┤       ├──────────────────────┤
│ id (UUID) PK         │       │ id (UUID) PK         │
│ scan_id FK           │       │ tool_name            │
│ requested_by FK      │       │ is_enabled           │
│ approved_by FK       │       │ default_options      │
│ status               │       │ timeout_seconds      │
│ reason               │       │ rate_limit           │
│ requested_at         │       │ max_concurrent       │
│ resolved_at          │       │ updated_at           │
└──────────────────────┘       └──────────────────────┘
```

## 🚀 Scalability Path

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              SCALABILITY ROADMAP                                         │
│                           Docker → Kubernetes Evolution                                  │
└─────────────────────────────────────────────────────────────────────────────────────────┘

PHASE 1: Docker Compose (Current)
├── Single host deployment
├── 5 concurrent scans
├── 50 users
├── Basic monitoring (Flower)
└── Manual scaling

PHASE 2: Docker Swarm
├── Multi-host deployment
├── Service replication
├── Built-in load balancing
├── Rolling updates
└── 20 concurrent scans, 200 users

PHASE 3: Kubernetes (Production Scale)
├── Horizontal Pod Autoscaling
│   ├── Scale workers based on queue depth
│   └── Scale API based on request rate
│
├── Resource Management
│   ├── Namespace isolation (dev/staging/prod)
│   ├── Resource quotas per namespace
│   └── Priority classes for scans
│
├── Storage
│   ├── Persistent Volume Claims
│   ├── S3-compatible object storage
│   └── Distributed file systems
│
├── Networking
│   ├── Ingress controllers
│   ├── Network policies
│   ├── Service mesh (Istio)
│   └── mTLS between services
│
├── Monitoring & Observability
│   ├── Prometheus metrics
│   ├── Grafana dashboards
│   ├── ELK stack for logs
│   ├── Jaeger for tracing
│   └── AlertManager
│
└── Capacity
    ├── 100+ concurrent scans
    ├── 1000+ users
    ├── Multi-region deployment
    └── 99.9% SLA

KUBERNETES ARCHITECTURE
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KUBERNETES CLUSTER                                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        INGRESS CONTROLLER                            │   │
│  │                    (NGINX / Traefik / AWS ALB)                        │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                          │
│  ┌───────────────────────────────┼─────────────────────────────────────┐   │
│  │                   NAMESPACE: vapt-platform                           │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   Frontend   │  │   Backend    │  │   Workers    │               │   │
│  │  │  Deployment  │  │  Deployment  │  │  Deployment  │               │   │
│  │  │  Replicas: 3 │  │  Replicas: 3 │  │  Replicas: N │               │   │
│  │  │  HPA: 2-10   │  │  HPA: 2-10   │  │  HPA: 5-50   │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────┐       │   │
│  │  │              TOOL PODS (Job-based / Ephemeral)           │       │   │
│  │  │                                                          │       │   │
│  │  │  Jobs created on-demand, cleaned up after completion     │       │   │
│  │  │  Resource limits enforced per job                        │       │   │
│  │  └──────────────────────────────────────────────────────────┘       │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │  PostgreSQL  │  │    Redis     │  │   MinIO/S3   │               │   │
│  │  │  StatefulSet │  │ StatefulSet  │  │  StatefulSet │               │   │
│  │  │  HA: 3 nodes │  │  HA: Sentinel│  │  Distributed │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 📝 Credits

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║                         VAPT PLATFORM v2.0                                    ║
║                                                                               ║
║                    Designed & Architected by VINNZz                           ║
║                                                                               ║
║                    Production-Ready Security Platform                         ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```
