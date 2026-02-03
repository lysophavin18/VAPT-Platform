import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Search, Filter, CheckCircle, XCircle } from 'lucide-react'
import api from '../api/client'

export default function Vulnerabilities() {
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const queryClient = useQueryClient()

  const { data: vulnerabilities, isLoading } = useQuery({
    queryKey: ['vulnerabilities', severityFilter, statusFilter],
    queryFn: () => api.get('/api/vulnerabilities', {
      params: {
        severity: severityFilter || undefined,
        status_filter: statusFilter || undefined
      }
    }).then(res => res.data)
  })

  const verifyVuln = useMutation({
    mutationFn: (id: string) => api.post(`/api/vulnerabilities/${id}/verify`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] })
  })

  const markFalsePositive = useMutation({
    mutationFn: (id: string) => api.post(`/api/vulnerabilities/${id}/false-positive`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] })
  })

  const getSeverityBadge = (severity: string) => {
    const classes: Record<string, string> = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-green-100 text-green-800 border-green-200',
      info: 'bg-blue-100 text-blue-800 border-blue-200'
    }
    return classes[severity] || 'bg-gray-100 text-gray-800'
  }

  const filteredVulns = vulnerabilities?.filter((v: any) =>
    v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.affected_url?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vulnerabilities</h1>
        <p className="text-gray-500">View and manage discovered vulnerabilities</p>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="search"
            placeholder="Search vulnerabilities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="confirmed">Confirmed</option>
          <option value="fixed">Fixed</option>
          <option value="false_positive">False Positive</option>
        </select>
      </div>

      {/* Vulnerabilities List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredVulns?.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No vulnerabilities found matching your criteria.
          </div>
        ) : (
          filteredVulns?.map((vuln: any) => (
            <div key={vuln.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    vuln.severity === 'critical' ? 'bg-red-100' :
                    vuln.severity === 'high' ? 'bg-orange-100' :
                    vuln.severity === 'medium' ? 'bg-yellow-100' :
                    'bg-green-100'
                  }`}>
                    <Shield className={`w-5 h-5 ${
                      vuln.severity === 'critical' ? 'text-red-600' :
                      vuln.severity === 'high' ? 'text-orange-600' :
                      vuln.severity === 'medium' ? 'text-yellow-600' :
                      'text-green-600'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{vuln.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{vuln.affected_url || 'N/A'}</p>
                    {vuln.description && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{vuln.description}</p>
                    )}
                    <div className="flex items-center space-x-4 mt-3">
                      {vuln.cve_id && (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{vuln.cve_id}</span>
                      )}
                      {vuln.cvss_score && (
                        <span className="text-xs text-gray-500">CVSS: {vuln.cvss_score}</span>
                      )}
                      <span className="text-xs text-gray-500">Found by: {vuln.found_by_tool}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  <span className={`px-3 py-1 text-xs font-medium rounded-full border ${getSeverityBadge(vuln.severity)}`}>
                    {vuln.severity}
                  </span>
                  <span className={`px-2 py-1 text-xs rounded ${
                    vuln.status === 'open' ? 'bg-red-50 text-red-700' :
                    vuln.status === 'confirmed' ? 'bg-orange-50 text-orange-700' :
                    vuln.status === 'fixed' ? 'bg-green-50 text-green-700' :
                    'bg-gray-50 text-gray-700'
                  }`}>
                    {vuln.status}
                  </span>
                </div>
              </div>
              {vuln.status === 'open' && (
                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center space-x-3">
                  <button
                    onClick={() => verifyVuln.mutate(vuln.id)}
                    className="flex items-center px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Verify
                  </button>
                  <button
                    onClick={() => markFalsePositive.mutate(vuln.id)}
                    className="flex items-center px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    False Positive
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
