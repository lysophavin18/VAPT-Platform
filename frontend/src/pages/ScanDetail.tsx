import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

export default function ScanDetail() {
  const { id } = useParams()
  
  const { data: scan, isLoading } = useQuery({
    queryKey: ['scan', id],
    queryFn: () => api.get(`/api/scans/${id}`).then(res => res.data),
    refetchInterval: (data) => data?.status === 'running' ? 5000 : false
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{scan?.scan_name}</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-gray-500">Status</dt>
            <dd className="font-medium">{scan?.status}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Progress</dt>
            <dd className="font-medium">{scan?.progress}%</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Type</dt>
            <dd className="font-medium">{scan?.scan_type}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Started</dt>
            <dd className="font-medium">{scan?.started_at ? new Date(scan.started_at).toLocaleString() : 'N/A'}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
