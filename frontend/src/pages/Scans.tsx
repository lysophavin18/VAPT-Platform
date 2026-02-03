import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Scan as ScanIcon, Play, Square, Search, Filter } from 'lucide-react'
import api from '../api/client'

const SCAN_TYPES = [
  { value: 'nmap', label: 'Nmap (Port Scan)', description: 'Network port and service discovery' },
  { value: 'nikto', label: 'Nikto', description: 'Web server vulnerability scanner' },
  { value: 'nuclei', label: 'Nuclei', description: 'Fast vulnerability scanner' },
  { value: 'zap', label: 'OWASP ZAP', description: 'Web application security scanner' },
  { value: 'sqlmap', label: 'SQLMap', description: 'SQL injection testing' },
  { value: 'gobuster', label: 'Gobuster', description: 'Directory brute-forcing' },
  { value: 'wpscan', label: 'WPScan', description: 'WordPress vulnerability scanner' },
  { value: 'full', label: 'Full Scan', description: 'Comprehensive multi-tool scan' },
]

export default function Scans() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const queryClient = useQueryClient()

  const { data: scans, isLoading } = useQuery({
    queryKey: ['scans', statusFilter],
    queryFn: () => api.get('/api/scans', { params: { status_filter: statusFilter || undefined } }).then(res => res.data)
  })

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/api/projects').then(res => res.data)
  })

  const { data: targets } = useQuery({
    queryKey: ['targets'],
    queryFn: () => api.get('/api/targets').then(res => res.data)
  })

  const createScan = useMutation({
    mutationFn: (data: any) => api.post('/api/scans', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] })
      setShowCreateModal(false)
    }
  })

  const stopScan = useMutation({
    mutationFn: (id: string) => api.post(`/api/scans/${id}/stop`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scans'] })
  })

  const handleCreateScan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    createScan.mutate({
      project_id: formData.get('project_id'),
      target_id: formData.get('target_id'),
      scan_name: formData.get('scan_name'),
      scan_type: formData.get('scan_type'),
      scan_profile: 'default'
    })
  }

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-yellow-100 text-yellow-800'
    }
    return classes[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scans</h1>
          <p className="text-gray-500">Manage and monitor security scans</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Scan
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="search"
            placeholder="Search scans..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Scans Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scan</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                </td>
              </tr>
            ) : scans?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No scans found. Start your first security scan!
                </td>
              </tr>
            ) : (
              scans?.map((scan: any) => (
                <tr key={scan.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link to={`/scans/${scan.id}`} className="flex items-center">
                      <ScanIcon className="w-5 h-5 text-gray-400 mr-3" />
                      <div>
                        <div className="font-medium text-gray-900">{scan.scan_name}</div>
                        <div className="text-sm text-gray-500">ID: {scan.id.slice(0, 8)}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900">{scan.scan_type}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(scan.status)}`}>
                      {scan.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className="bg-primary-600 h-2 rounded-full"
                          style={{ width: `${scan.progress}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-500">{scan.progress}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(scan.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {scan.status === 'running' && (
                      <button
                        onClick={() => stopScan.mutate(scan.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New Scan</h2>
            <form onSubmit={handleCreateScan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scan Name</label>
                <input
                  name="scan_name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Initial Web Scan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                <select
                  name="project_id"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select a project</option>
                  {projects?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
                <select
                  name="target_id"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select a target</option>
                  {targets?.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.target_value})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scan Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {SCAN_TYPES.map((type) => (
                    <label
                      key={type.value}
                      className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-primary-500"
                    >
                      <input type="radio" name="scan_type" value={type.value} className="mt-1 mr-3" />
                      <div>
                        <div className="font-medium text-gray-900">{type.label}</div>
                        <div className="text-xs text-gray-500">{type.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createScan.isPending}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                >
                  {createScan.isPending ? 'Starting...' : 'Start Scan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
