import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts'
import {
  FolderKanban,
  Scan,
  Shield,
  AlertTriangle,
  TrendingUp,
  Activity,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react'
import api from '../api/client'

const SEVERITY_COLORS = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
  info: '#2563eb'
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/api/dashboard/stats').then(res => res.data)
  })

  const { data: recentScans } = useQuery({
    queryKey: ['recent-scans'],
    queryFn: () => api.get('/api/dashboard/recent-scans').then(res => res.data)
  })

  const { data: topVulns } = useQuery({
    queryKey: ['top-vulnerabilities'],
    queryFn: () => api.get('/api/dashboard/top-vulnerabilities').then(res => res.data)
  })

  const { data: trends } = useQuery({
    queryKey: ['vulnerability-trends'],
    queryFn: () => api.get('/api/dashboard/vulnerability-trends').then(res => res.data)
  })

  const vulnPieData = stats ? [
    { name: 'Critical', value: stats.critical_vulnerabilities, color: SEVERITY_COLORS.critical },
    { name: 'High', value: stats.high_vulnerabilities, color: SEVERITY_COLORS.high },
    { name: 'Medium', value: stats.medium_vulnerabilities, color: SEVERITY_COLORS.medium },
    { name: 'Low', value: stats.low_vulnerabilities, color: SEVERITY_COLORS.low },
    { name: 'Info', value: stats.info_vulnerabilities, color: SEVERITY_COLORS.info },
  ].filter(d => d.value > 0) : []

  const getSeverityBadge = (severity: string) => {
    const classes: Record<string, string> = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800',
      info: 'bg-blue-100 text-blue-800'
    }
    return classes[severity] || 'bg-gray-100 text-gray-800'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Overview of your security assessment activities</p>
        </div>
        <Link
          to="/scans"
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center"
        >
          <Scan className="w-4 h-4 mr-2" />
          New Scan
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Projects</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.total_projects || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FolderKanban className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Scans</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.active_scans || 0}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Scan className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Vulnerabilities</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.total_vulnerabilities || 0}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Critical Issues</p>
              <p className="text-3xl font-bold text-red-600 mt-1">{stats?.critical_vulnerabilities || 0}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vulnerability Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Vulnerability Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={vulnPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {vulnPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {vulnPieData.map((entry) => (
              <div key={entry.name} className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: entry.color }} />
                <span className="text-sm text-gray-600">{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Vulnerability Trends */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Vulnerability Trends</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="critical" stroke={SEVERITY_COLORS.critical} strokeWidth={2} />
                <Line type="monotone" dataKey="high" stroke={SEVERITY_COLORS.high} strokeWidth={2} />
                <Line type="monotone" dataKey="medium" stroke={SEVERITY_COLORS.medium} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Scans */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Scans</h2>
            <Link to="/scans" className="text-sm text-primary-600 hover:text-primary-700">View all</Link>
          </div>
          <div className="divide-y divide-gray-200">
            {recentScans?.slice(0, 5).map((scan: any) => (
              <Link
                key={scan.id}
                to={`/scans/${scan.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3">
                  {getStatusIcon(scan.status)}
                  <div>
                    <p className="font-medium text-gray-900">{scan.scan_name}</p>
                    <p className="text-sm text-gray-500">{scan.scan_type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    scan.status === 'completed' ? 'bg-green-100 text-green-800' :
                    scan.status === 'running' ? 'bg-blue-100 text-blue-800' :
                    scan.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {scan.status}
                  </span>
                </div>
              </Link>
            ))}
            {(!recentScans || recentScans.length === 0) && (
              <div className="px-6 py-8 text-center text-gray-500">
                No scans yet. Start your first scan!
              </div>
            )}
          </div>
        </div>

        {/* Top Vulnerabilities */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Critical & High Vulnerabilities</h2>
            <Link to="/vulnerabilities" className="text-sm text-primary-600 hover:text-primary-700">View all</Link>
          </div>
          <div className="divide-y divide-gray-200">
            {topVulns?.slice(0, 5).map((vuln: any) => (
              <div key={vuln.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{vuln.title}</p>
                    <p className="text-sm text-gray-500 truncate">{vuln.affected_url || 'N/A'}</p>
                  </div>
                  <span className={`ml-4 inline-flex px-2 py-1 text-xs font-medium rounded-full ${getSeverityBadge(vuln.severity)}`}>
                    {vuln.severity}
                  </span>
                </div>
                {vuln.cvss_score && (
                  <p className="mt-1 text-xs text-gray-500">CVSS: {vuln.cvss_score}</p>
                )}
              </div>
            ))}
            {(!topVulns || topVulns.length === 0) && (
              <div className="px-6 py-8 text-center text-gray-500">
                No critical or high vulnerabilities found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
