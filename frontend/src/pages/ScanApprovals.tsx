/**
 * VAPT Platform - Scan Approvals Page
 * Designed by VINNZz
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Target,
  Shield,
  Info,
  Calendar,
  ExternalLink
} from 'lucide-react';
import api from '../services/api';

interface PendingScan {
  id: string;
  project_id: string;
  target_id: string;
  scan_type: string;
  scan_profile: string;
  status: string;
  created_by: string;
  created_at: string;
  project?: {
    name: string;
  };
  target?: {
    name: string;
    host: string;
    url: string;
  };
  creator?: {
    full_name: string;
    email: string;
  };
}

export default function ScanApprovals() {
  const navigate = useNavigate();
  const [pendingScans, setPendingScans] = useState<PendingScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    show: boolean;
    scanId: string;
    reason: string;
  }>({ show: false, scanId: '', reason: '' });

  useEffect(() => {
    loadPendingScans();
  }, []);

  const loadPendingScans = async () => {
    try {
      const response = await api.get('/scans/pending-approval');
      setPendingScans(response.data.items || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load pending scans');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (scanId: string) => {
    setProcessingId(scanId);
    try {
      await api.post(`/scans/${scanId}/approve`, { reason: 'Approved' });
      setPendingScans(prev => prev.filter(s => s.id !== scanId));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to approve scan');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) {
      return;
    }

    setProcessingId(rejectModal.scanId);
    try {
      await api.post(`/scans/${rejectModal.scanId}/reject`, {
        reason: rejectModal.reason
      });
      setPendingScans(prev => prev.filter(s => s.id !== rejectModal.scanId));
      setRejectModal({ show: false, scanId: '', reason: '' });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reject scan');
    } finally {
      setProcessingId(null);
    }
  };

  const getProfileColor = (profile: string) => {
    const colors: Record<string, string> = {
      quick: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      full: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      aggressive: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      custom: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    };
    return colors[profile] || colors.custom;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
          <Clock className="w-8 h-8 mr-3 text-orange-500" />
          Scan Approvals
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Review and approve scan requests that require authorization
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start">
        <Info className="w-5 h-5 text-blue-500 mt-0.5" />
        <div className="ml-3">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Aggressive Profile Scans</strong> and scans using <strong>brute-force tools</strong> (Hydra, SQLMap with intensive options) 
            require manager approval before execution to ensure compliance with engagement rules.
          </p>
        </div>
      </div>

      {/* Pending Scans List */}
      {pendingScans.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-12 text-center">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            All caught up!
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            There are no scans pending approval at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingScans.map(scan => (
            <div
              key={scan.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden"
            >
              {/* Warning Banner */}
              <div className="bg-orange-50 dark:bg-orange-900/20 px-6 py-3 border-b border-orange-200 dark:border-orange-800 flex items-center">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <span className="ml-2 text-sm font-medium text-orange-700 dark:text-orange-300">
                  {scan.scan_profile === 'aggressive' 
                    ? 'Aggressive scan profile - high intensity testing'
                    : 'Requires approval before execution'}
                </span>
              </div>

              <div className="p-6">
                <div className="flex items-start justify-between">
                  {/* Scan Details */}
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getProfileColor(scan.scan_profile)}`}>
                        <Shield className="w-4 h-4 inline mr-1" />
                        {scan.scan_profile.toUpperCase()}
                      </span>
                      <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300">
                        {scan.scan_type.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Target Info */}
                      <div className="flex items-start">
                        <Target className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div className="ml-3">
                          <p className="text-sm text-gray-500 dark:text-gray-400">Target</p>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {scan.target?.name || 'Unknown'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {scan.target?.url || scan.target?.host}
                          </p>
                        </div>
                      </div>

                      {/* Requester Info */}
                      <div className="flex items-start">
                        <User className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div className="ml-3">
                          <p className="text-sm text-gray-500 dark:text-gray-400">Requested by</p>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {scan.creator?.full_name || 'Unknown'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {scan.creator?.email}
                          </p>
                        </div>
                      </div>

                      {/* Project Info */}
                      <div className="flex items-start">
                        <ExternalLink className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div className="ml-3">
                          <p className="text-sm text-gray-500 dark:text-gray-400">Project</p>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {scan.project?.name || 'Unknown'}
                          </p>
                        </div>
                      </div>

                      {/* Requested Time */}
                      <div className="flex items-start">
                        <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div className="ml-3">
                          <p className="text-sm text-gray-500 dark:text-gray-400">Requested</p>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {new Date(scan.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="ml-6 flex flex-col space-y-2">
                    <button
                      onClick={() => handleApprove(scan.id)}
                      disabled={processingId === scan.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center"
                    >
                      {processingId === scan.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      ) : (
                        <CheckCircle className="w-4 h-4 mr-2" />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectModal({ show: true, scanId: scan.id, reason: '' })}
                      disabled={processingId === scan.id}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </button>
                    <button
                      onClick={() => navigate(`/scans/${scan.id}`)}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium flex items-center"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Reject Scan Request
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Please provide a reason for rejecting this scan request. 
              The requester will be notified.
            </p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Enter rejection reason..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              rows={4}
            />
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setRejectModal({ show: false, scanId: '', reason: '' })}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectModal.reason.trim() || processingId !== null}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Reject Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit */}
      <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-600">
        Designed by VINNZz
      </p>
    </div>
  );
}
