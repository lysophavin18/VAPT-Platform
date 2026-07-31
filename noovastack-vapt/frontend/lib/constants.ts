import { Archive, Bell, Bot, Calculator, CalendarClock, CheckCircle2, Container, FileCode2, FileText, FolderKanban, Gauge, Globe2, Network, Radar, Search, Settings, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { BRAND } from '@/lib/branding';

export const APP_NAME = BRAND.productName;

export const scanCategories = [
  { id: 'vulnerability_scan', title: 'Vulnerability Scan', description: 'General safe vulnerability checks across approved targets.', icon: ShieldAlert },
  { id: 'website', title: 'Web Application', description: 'Check websites, portals, dashboards, headers, TLS, and OWASP risks.', icon: Globe2 },
  { id: 'api_security', title: 'API', description: 'Check REST, GraphQL, Swagger, OpenAPI, or Postman-based APIs.', icon: FileCode2 },
  { id: 'network', title: 'Network', description: 'Find live systems, open ports, and exposed services.', icon: Network },
  { id: 'container', title: 'Container', description: 'Check container images, packages, dependencies, and known CVEs.', icon: Container },
] as const;

export const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Gauge, roles: ['admin', 'manager', 'analyst', 'viewer'] },
  { href: '/projects', label: 'Projects', icon: FolderKanban, roles: ['admin', 'manager', 'analyst', 'viewer'], children: [{ label: 'All Projects', href: '/projects' }, { label: 'New Project', href: '/projects/new' }, { label: 'Archived Projects', href: '/projects?status=archived' }] },
  { href: '/assets', label: 'Assets', icon: Network, roles: ['admin', 'manager', 'analyst', 'viewer'], children: [{ label: 'Asset Inventory', href: '/assets' }, { label: 'Asset Discovery', href: '/assets/discovery' }, { label: 'Asset Graph', href: '/assets/graph' }, { label: 'Scope Review', href: '/assets?scope=review' }] },
  { href: '/scans', label: 'Scans', icon: Radar, roles: ['admin', 'manager', 'analyst', 'viewer'], children: [{ label: 'All Scans', href: '/scans' }, { label: 'New Scan', href: '/scans/new' }, { label: 'Running', href: '/scans?status=running' }, { label: 'Completed', href: '/scans?status=completed' }, { label: 'Failed or Blocked', href: '/scans?status=attention' }] },
  { href: '/schedules', label: 'Schedules', icon: CalendarClock, roles: ['admin', 'manager', 'analyst'] },
  { href: '/findings', label: 'Findings', icon: ShieldCheck, roles: ['admin', 'manager', 'analyst', 'viewer'] },
  { href: '/ai-agents', label: 'Generative AI', icon: Bot, roles: ['admin', 'manager', 'analyst', 'viewer'] },
  { href: '/cvss-calculator', label: 'CVSS Calculator', icon: Calculator, roles: ['admin', 'manager', 'analyst', 'viewer'] },
  { href: '/reports', label: 'Reports', icon: FileText, roles: ['admin', 'manager', 'analyst', 'viewer'] },
  { href: '/retests', label: 'Retests', icon: CheckCircle2, roles: ['admin', 'manager', 'analyst'] },
  { href: '/audit-logs', label: 'Audit Logs', icon: Archive, roles: ['admin', 'manager'] },
  { href: '/administration', label: 'System Administrator', icon: Settings, roles: ['admin'] },
] as const;

export const quickActions = [
  { href: '/projects/new', label: 'Create Project', icon: FolderKanban },
  { href: '/assets/discovery', label: 'Start Asset Discovery', icon: Search },
  { href: '/scans/new', label: 'New Scan', icon: Radar },
  { href: '/administration', label: 'System Administrator', icon: Users },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/cvss-calculator', label: 'CVSS Calculator', icon: Calculator },
  { href: '/notifications', label: 'Notifications', icon: Bell },
] as const;
