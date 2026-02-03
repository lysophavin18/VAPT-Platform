/**
 * VAPT Platform - Enhanced Scan Creation Component
 * Designed by VINNZz
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Play,
  Shield,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle2,
  Settings,
  ChevronRight,
  Target,
  Zap,
  Search,
  Lock
} from 'lucide-react';
import api from '../services/api';

interface ScanProfile {
  name: string;
  display_name: string;
  duration_estimate: string;
  tools_count: number;
  requires_approval: boolean;
  description: string;
}

interface Tool {
  name: string;
  display_name: string;
  category: string;
  is_enabled: boolean;
  requires_approval: boolean;
  timeout_seconds: number;
  description: string;
}

interface Target {
  id: string;
  name: string;
  target_type: string;
  host: string;
  url: string;
  is_active: boolean;
}

const profileIcons: Record<string, JSX.Element> = {
  quick: <Zap className="w-6 h-6" />,
  full: <Search className="w-6 h-6" />,
  aggressive: <Shield className="w-6 h-6" />,
  custom: <Settings className="w-6 h-6" />
};

const profileColors: Record<string, string> = {
  quick: 'from-green-500 to-emerald-600',
  full: 'from-blue-500 to-indigo-600',
  aggressive: 'from-orange-500 to-red-600',
  custom: 'from-purple-500 to-violet-600'
};

export default function ScanCreate() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form state
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [scanType, setScanType] = useState<string>('web');
  const [selectedProfile, setSelectedProfile] = useState<string>('quick');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [toolOptions, setToolOptions] = useState<Record<string, any>>({});
  
  // Data state
  const [targets, setTargets] = useState<Target[]>([]);
  const [profiles, setProfiles] = useState<ScanProfile[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    loadInitialData();
  }, [projectId]);

  const loadInitialData = async () => {
    try {
      const [targetsRes, profilesRes, toolsRes] = await Promise.all([
        api.get(`/targets?project_id=${projectId}`),
        api.get('/scans/profiles'),
        api.get('/scans/tools')
      ]);
      
      setTargets(targetsRes.data.items || []);
      setProfiles(profilesRes.data || []);
      setTools(toolsRes.data || []);
    } catch (err) {
      setError('Failed to load scan configuration');
    }
  };

  const handleProfileSelect = (profileName: string) => {
    setSelectedProfile(profileName);
    
    // Auto-select tools for non-custom profiles
    if (profileName !== 'custom') {
      const profile = profiles.find(p => p.name === profileName);
      // Tools will be auto-selected by backend based on profile
      setSelectedTools([]);
    }
  };

  const handleToolToggle = (toolName: string) => {
    if (selectedProfile !== 'custom') return;
    
    setSelectedTools(prev => 
      prev.includes(toolName)
        ? prev.filter(t => t !== toolName)
        : [...prev, toolName]
    );
  };

  const handleSubmit = async () => {
    if (!selectedTarget) {
      setError('Please select a target');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const payload = {
        project_id: projectId,
        target_id: selectedTarget,
        scan_type: scanType,
        scan_profile: selectedProfile,
        enabled_tools: selectedProfile === 'custom' ? selectedTools : null,
        tool_options: Object.keys(toolOptions).length > 0 ? toolOptions : null
      };
      
      const response = await api.post('/scans', payload);
      
      if (response.data.status === 'pending_approval') {
        navigate(`/scans/${response.data.id}`, { 
          state: { message: 'Scan created and pending approval from a manager' }
        });
      } else {
        navigate(`/scans/${response.data.id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create scan');
    } finally {
      setLoading(false);
    }
  };

  const currentProfile = profiles.find(p => p.name === selectedProfile);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Create New Scan
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Configure and launch a security scan
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {['Target', 'Profile', 'Tools', 'Review'].map((label, index) => (
            <div key={label} className="flex items-center">
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                  step > index + 1
                    ? 'bg-green-500 text-white'
                    : step === index + 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                }`}
              >
                {step > index + 1 ? <CheckCircle2 className="w-5 h-5" /> : index + 1}
              </div>
              <span className={`ml-2 text-sm font-medium ${
                step >= index + 1 ? 'text-gray-900 dark:text-white' : 'text-gray-400'
              }`}>
                {label}
              </span>
              {index < 3 && (
                <ChevronRight className="w-5 h-5 mx-4 text-gray-400" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Step 1: Target Selection */}
      {step === 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center">
            <Target className="w-5 h-5 mr-2" />
            Select Target
          </h2>
          
          <div className="space-y-3">
            {targets.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">
                No targets found. Please add a target to the project first.
              </p>
            ) : (
              targets.filter(t => t.is_active).map(target => (
                <label
                  key={target.id}
                  className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedTarget === target.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="target"
                    value={target.id}
                    checked={selectedTarget === target.id}
                    onChange={(e) => setSelectedTarget(e.target.value)}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {target.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {target.url || target.host} • {target.target_type}
                    </p>
                  </div>
                  {selectedTarget === target.id && (
                    <CheckCircle2 className="w-5 h-5 text-blue-500" />
                  )}
                </label>
              ))
            )}
          </div>

          {/* Scan Type */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Scan Type
            </h3>
            <div className="flex space-x-4">
              {['web', 'api', 'network'].map(type => (
                <button
                  key={type}
                  onClick={() => setScanType(type)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    scanType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!selectedTarget}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Profile Selection */}
      {step === 2 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            Select Scan Profile
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map(profile => (
              <div
                key={profile.name}
                onClick={() => handleProfileSelect(profile.name)}
                className={`relative p-5 border-2 rounded-xl cursor-pointer transition-all ${
                  selectedProfile === profile.name
                    ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl bg-gradient-to-r ${profileColors[profile.name]}`} />
                
                <div className="flex items-start">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${profileColors[profile.name]} text-white`}>
                    {profileIcons[profile.name]}
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {profile.display_name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {profile.description}
                    </p>
                    <div className="flex items-center mt-3 space-x-4 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {profile.duration_estimate}
                      </span>
                      <span className="flex items-center">
                        <Settings className="w-3 h-3 mr-1" />
                        {profile.tools_count} tools
                      </span>
                    </div>
                  </div>
                </div>

                {profile.requires_approval && (
                  <div className="mt-3 flex items-center text-xs text-orange-600 dark:text-orange-400">
                    <Lock className="w-3 h-3 mr-1" />
                    Requires manager approval
                  </div>
                )}

                {selectedProfile === profile.name && (
                  <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-blue-500" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium"
            >
              Back
            </button>
            <button
              onClick={() => setStep(selectedProfile === 'custom' ? 3 : 4)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              {selectedProfile === 'custom' ? 'Configure Tools' : 'Review'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Tool Configuration (Custom Profile Only) */}
      {step === 3 && selectedProfile === 'custom' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            Configure Tools
          </h2>
          
          <div className="space-y-3">
            {tools.filter(t => t.is_enabled).map(tool => (
              <label
                key={tool.name}
                className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedTools.includes(tool.name)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTools.includes(tool.name)}
                  onChange={() => handleToolToggle(tool.name)}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="flex items-center">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {tool.display_name}
                    </p>
                    <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
                      {tool.category}
                    </span>
                    {tool.requires_approval && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-full flex items-center">
                        <Lock className="w-3 h-3 mr-1" />
                        Approval
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {tool.description}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  selectedTools.includes(tool.name)
                    ? 'bg-blue-500 border-blue-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {selectedTools.includes(tool.name) && (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium"
            >
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={selectedTools.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Review
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Launch */}
      {step === 4 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white flex items-center">
            <CheckCircle2 className="w-5 h-5 mr-2" />
            Review & Launch
          </h2>
          
          <div className="space-y-6">
            {/* Target Summary */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Target
              </h3>
              <p className="font-medium text-gray-900 dark:text-white">
                {targets.find(t => t.id === selectedTarget)?.name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {targets.find(t => t.id === selectedTarget)?.url || 
                 targets.find(t => t.id === selectedTarget)?.host}
              </p>
            </div>

            {/* Profile Summary */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Scan Profile
              </h3>
              <div className="flex items-center">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${profileColors[selectedProfile]} text-white`}>
                  {profileIcons[selectedProfile]}
                </div>
                <div className="ml-3">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {currentProfile?.display_name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {currentProfile?.duration_estimate} • {currentProfile?.tools_count} tools
                  </p>
                </div>
              </div>
            </div>

            {/* Scan Type */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Scan Type
              </h3>
              <p className="font-medium text-gray-900 dark:text-white uppercase">
                {scanType}
              </p>
            </div>

            {/* Custom Tools */}
            {selectedProfile === 'custom' && selectedTools.length > 0 && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Selected Tools
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedTools.map(tool => (
                    <span
                      key={tool}
                      className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Approval Warning */}
            {currentProfile?.requires_approval && (
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg flex items-start">
                <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5" />
                <div className="ml-3">
                  <p className="font-medium text-orange-700 dark:text-orange-300">
                    Approval Required
                  </p>
                  <p className="text-sm text-orange-600 dark:text-orange-400">
                    This scan profile requires manager approval before execution.
                    You will be notified once the scan is approved.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-between">
            <button
              onClick={() => setStep(selectedProfile === 'custom' ? 3 : 2)}
              className="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  {currentProfile?.requires_approval ? 'Submit for Approval' : 'Launch Scan'}
                </>
              )}
            </button>
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
