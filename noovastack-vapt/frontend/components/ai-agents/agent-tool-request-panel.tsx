'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AlertTriangle, Bot, CheckCircle2, Clock, Hammer, Play, ShieldCheck, X, Wrench } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import type { Project, Engagement, Asset, ScannerTool, ScanValidationResult } from '@/types';

const RISK_LEVELS = [
  { value: 'low', label: 'Low', color: 'text-green-600 bg-green-50 border-green-200' },
  { value: 'medium', label: 'Medium', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'high', label: 'High', color: 'text-orange-600 bg-orange-50 border-orange-200' },
];

const SCAN_CATEGORIES = [
  { value: 'website', label: 'Website' },
  { value: 'api', label: 'API' },
  { value: 'network', label: 'Network' },
  { value: 'code', label: 'Code' },
  { value: 'dependency', label: 'Dependency' },
  { value: 'complete', label: 'Complete Application' },
];

const SCAN_DEPTHS = [
  { value: 'quick', label: 'Quick' },
  { value: 'standard', label: 'Standard' },
  { value: 'deep', label: 'Deep' },
  { value: 'custom', label: 'Custom' },
];

const ASSESSMENT_MODES = [
  { value: 'black_box', label: 'Black Box' },
  { value: 'gray_box', label: 'Gray Box' },
  { value: 'white_box', label: 'White Box' },
];

export interface AgentToolRequestPanelProps {
  agentId?: string;
  open: boolean;
  onClose: () => void;
  onSubmitted?: (result: AgentToolRequestResult) => void;
}

export interface AgentToolRequestResult {
  status: string;
  scan_id?: string;
  modules?: string[];
  validation?: ScanValidationResult;
  launch?: { scan_id: string; status: string; celery_task_id: string | null } | null;
  human_review_required?: boolean;
  message?: string;
}

export function AgentToolRequestPanel({ agentId, open, onClose, onSubmitted }: AgentToolRequestPanelProps) {
  const { token } = useAuth();

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.projects(token), enabled: open && !!token });
  const tools = useQuery({ queryKey: ['scanner-tools'], queryFn: () => api.scannerTools(token), enabled: open && !!token });

  const [projectId, setProjectId] = useState('');
  const [engagementId, setEngagementId] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [taskType, setTaskType] = useState('safe_vulnerability_scan');
  const [assessmentMode, setAssessmentMode] = useState('black_box');
  const [scanCategory, setScanCategory] = useState('website');
  const [scanDepth, setScanDepth] = useState('standard');
  const [riskLevel, setRiskLevel] = useState('low');
  const [modules, setModules] = useState<string[]>([]);
  const [rationale, setRationale] = useState('');
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [result, setResult] = useState<AgentToolRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engagements = useQuery({
    queryKey: ['engagements', projectId],
    queryFn: () => api.engagements(projectId, token),
    enabled: open && !!token && !!projectId,
  });

  const assets = useQuery({
    queryKey: ['assets', projectId],
    queryFn: () => api.assets(projectId, token),
    enabled: open && !!token && !!projectId,
  });

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (projectId) {
      setEngagementId('');
      setSelectedAssetIds([]);
      setTarget('');
    }
  }, [projectId]);

  const approvedAssets = useMemo(() => {
    return (assets.data ?? []).filter((a: Asset) => a.scope_status === 'in_scope' && a.approval_status === 'approved');
  }, [assets.data]);

  useEffect(() => {
    if (selectedAssetIds.length === 1 && approvedAssets.length) {
      const asset = approvedAssets.find((a) => a.id === selectedAssetIds[0]);
      if (asset) setTarget(asset.value);
    }
  }, [selectedAssetIds, approvedAssets]);

  const submit = useMutation({
    mutationFn: () =>
      api.requestAgentTool(
        {
          project_id: projectId,
          engagement_id: engagementId || null,
          asset_ids: selectedAssetIds,
          target: target.trim(),
          task_type: taskType,
          assessment_mode: assessmentMode,
          scan_category: scanCategory,
          scan_depth: scanDepth,
          risk_level: riskLevel as 'low' | 'medium' | 'high' | 'prohibited',
          modules,
          config: {},
          auto_launch: autoLaunch,
          rationale: rationale || undefined,
        },
        token,
      ),
    onSuccess: (data) => {
      const parsed = data as unknown as AgentToolRequestResult;
      setResult(parsed);
      setError(null);
      onSubmitted?.(parsed);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Tool request failed';
      setError(message);
      setResult(null);
    },
  });

  const isHighRisk = riskLevel === 'high' || modules.some((m) => HUMAN_APPROVAL_MODULES.includes(m));
  const canSubmit = projectId && selectedAssetIds.length > 0 && target.trim() && modules.length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F3A]/70 p-4">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#223044] bg-[#0D1928] p-6 text-white shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-[#94A3B8] hover:bg-[#111E2E] hover:text-white">
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#E51C2A]/20 text-[#E51C2A]">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">AI Agent Tool Request</h2>
            <p className="text-sm text-[#94A3B8]">
              {agentId ? `Request controlled tool execution for ${agentId}` : 'Request controlled tool execution through the platform'}
            </p>
          </div>
        </div>

        {result ? (
          <ResultView result={result} onReset={() => setResult(null)} onClose={onClose} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
            className="space-y-5"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#CBD5E1]">Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-xl border border-[#223044] bg-[#111E2E] px-3 py-2 text-sm text-white focus:border-[#E51C2A] focus:outline-none"
                >
                  <option value="">Select project</option>
                  {(projects.data ?? []).map((p: Project) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#CBD5E1]">Engagement (optional)</label>
                <select
                  value={engagementId}
                  onChange={(e) => setEngagementId(e.target.value)}
                  disabled={!projectId || engagements.isLoading}
                  className="w-full rounded-xl border border-[#223044] bg-[#111E2E] px-3 py-2 text-sm text-white disabled:opacity-50 focus:border-[#E51C2A] focus:outline-none"
                >
                  <option value="">None / default</option>
                  {(engagements.data ?? []).map((e: Engagement) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#CBD5E1]">Approved In-Scope Assets</label>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-[#223044] bg-[#111E2E] p-2">
                {assets.isLoading ? (
                  <p className="p-2 text-sm text-[#94A3B8]">Loading assets...</p>
                ) : approvedAssets.length === 0 ? (
                  <p className="p-2 text-sm text-[#94A3B8]">No approved in-scope assets found for this project.</p>
                ) : (
                  approvedAssets.map((asset: Asset) => (
                    <label key={asset.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-[#162133]">
                      <input
                        type="checkbox"
                        checked={selectedAssetIds.includes(asset.id)}
                        onChange={(e) => {
                          setSelectedAssetIds((prev) =>
                            e.target.checked ? [...prev, asset.id] : prev.filter((id) => id !== asset.id),
                          );
                        }}
                        className="h-4 w-4 accent-[#E51C2A]"
                      />
                      <span className="text-sm text-white">{asset.name || asset.value}</span>
                      <span className="ml-auto text-xs text-[#64748B]">{asset.asset_type}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#CBD5E1]">Target</label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="https://example.com or 10.0.0.1"
                className="w-full rounded-xl border border-[#223044] bg-[#111E2E] px-3 py-2 text-sm text-white placeholder:text-[#64748B] focus:border-[#E51C2A] focus:outline-none"
              />
              <p className="text-xs text-[#64748B]">Must match the selected approved asset value exactly.</p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#CBD5E1]">Assessment Mode</label>
                <select
                  value={assessmentMode}
                  onChange={(e) => setAssessmentMode(e.target.value)}
                  className="w-full rounded-xl border border-[#223044] bg-[#111E2E] px-3 py-2 text-sm text-white focus:border-[#E51C2A] focus:outline-none"
                >
                  {ASSESSMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#CBD5E1]">Scan Category</label>
                <select
                  value={scanCategory}
                  onChange={(e) => setScanCategory(e.target.value)}
                  className="w-full rounded-xl border border-[#223044] bg-[#111E2E] px-3 py-2 text-sm text-white focus:border-[#E51C2A] focus:outline-none"
                >
                  {SCAN_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#CBD5E1]">Scan Depth</label>
                <select
                  value={scanDepth}
                  onChange={(e) => setScanDepth(e.target.value)}
                  className="w-full rounded-xl border border-[#223044] bg-[#111E2E] px-3 py-2 text-sm text-white focus:border-[#E51C2A] focus:outline-none"
                >
                  {SCAN_DEPTHS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#CBD5E1]">Risk Level</label>
              <div className="flex gap-2">
                {RISK_LEVELS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRiskLevel(r.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      riskLevel === r.value ? r.color : 'border-[#223044] bg-[#111E2E] text-[#94A3B8]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {isHighRisk && (
                <p className="flex items-center gap-2 text-xs text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  This request will require human approval before execution.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#CBD5E1]">Modules</label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(tools.data ?? []).map((tool: ScannerTool) => {
                  const selected = modules.includes(tool.module);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() =>
                        setModules((prev) =>
                          selected ? prev.filter((m) => m !== tool.module) : [...prev, tool.module],
                        )
                      }
                      className={`rounded-xl border p-3 text-left text-sm transition ${
                        selected
                          ? 'border-[#E51C2A] bg-[#E51C2A]/10 text-white'
                          : 'border-[#223044] bg-[#111E2E] text-[#94A3B8] hover:border-[#334155]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Hammer className="h-4 w-4" />
                        <span className="font-semibold">{tool.name}</span>
                        {!tool.safe_default && <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">APPROVAL</span>}
                      </div>
                      <p className="mt-1 text-xs text-[#64748B]">{tool.purpose}</p>
                    </button>
                  );
                })}
              </div>
              {tools.isLoading && <p className="text-sm text-[#94A3B8]">Loading tool catalog...</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#CBD5E1]">Rationale</label>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={3}
                placeholder="Explain why the AI agent needs to run these tools against this target."
                className="w-full rounded-xl border border-[#223044] bg-[#111E2E] px-3 py-2 text-sm text-white placeholder:text-[#64748B] focus:border-[#E51C2A] focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-[#223044] bg-[#111E2E] p-3">
              <input
                type="checkbox"
                checked={autoLaunch}
                onChange={(e) => setAutoLaunch(e.target.checked)}
                className="h-4 w-4 accent-[#E51C2A]"
              />
              <span className="text-sm text-[#CBD5E1]">Auto-launch if validation passes and no approval is required</span>
            </label>

            {error && (
              <div className="rounded-xl border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-semibold">Request failed</span>
                </div>
                <p className="mt-1">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[#223044] bg-[#111E2E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162133]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit || submit.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E51C2A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9F1239] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submit.isPending ? (
                  <>
                    <Clock className="h-4 w-4 animate-spin" /> Validating...
                  </>
                ) : (
                  <>
                    <Bot className="h-4 w-4" /> Request Tool Execution
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ResultView({ result, onReset, onClose }: { result: AgentToolRequestResult; onReset: () => void; onClose: () => void }) {
  const isApproval = result.status === 'approval_required';
  const isLaunched = result.status === 'launched';
  const isCreated = result.status === 'created';

  return (
    <div className="space-y-5">
      <div className={`rounded-xl border p-4 ${isLaunched ? 'border-green-700 bg-green-950/30' : isApproval ? 'border-amber-700 bg-amber-950/30' : 'border-[#223044] bg-[#111E2E]'}`}>
        <div className="flex items-center gap-2">
          {isLaunched ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : isApproval ? <ShieldCheck className="h-5 w-5 text-amber-400" /> : <Play className="h-5 w-5 text-[#E51C2A]" />}
          <h3 className="font-semibold">
            {isLaunched ? 'Scan launched' : isApproval ? 'Approval required' : isCreated ? 'Scan created' : 'Request received'}
          </h3>
        </div>
        <p className="mt-2 text-sm text-[#CBD5E1]">
          {result.message ?? `The AI tool request was processed with status: ${result.status}`}
        </p>
        {result.scan_id && <p className="mt-2 text-sm text-[#94A3B8]">Scan ID: <span className="font-mono text-white">{result.scan_id}</span></p>}
        {result.launch?.scan_id && (
          <p className="mt-2 text-sm text-[#94A3B8]">
            Celery task: <span className="font-mono text-white">{result.launch.celery_task_id || 'queued'}</span>
          </p>
        )}
        {result.human_review_required && (
          <p className="mt-2 text-xs text-amber-400">Human review is required for this request.</p>
        )}
      </div>

      {result.validation && (
        <div className="rounded-xl border border-[#223044] bg-[#111E2E] p-4">
          <h4 className="mb-2 text-sm font-semibold">Validation</h4>
          <ul className="space-y-1 text-sm text-[#94A3B8]">
            <li>Valid: <span className={result.validation.valid ? 'text-green-400' : 'text-red-400'}>{result.validation.valid ? 'Yes' : 'No'}</span></li>
            <li>Approval required: {result.validation.approval_required ? 'Yes' : 'No'}</li>
            <li>Safety controls active: {result.validation.safety_controls_active ? 'Yes' : 'No'}</li>
            <li>Estimated duration: {result.validation.estimated_duration}</li>
            {result.validation.blocking_reasons?.length ? (
              <li className="text-red-400">Blocking: {result.validation.blocking_reasons.join(', ')}</li>
            ) : null}
            {result.validation.warnings?.length ? (
              <li className="text-amber-400">Warnings: {result.validation.warnings.join(', ')}</li>
            ) : null}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={onReset}
          className="rounded-xl border border-[#223044] bg-[#111E2E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162133]"
        >
          New Request
        </button>
        <button
          onClick={onClose}
          className="rounded-xl bg-[#E51C2A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9F1239]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

const HUMAN_APPROVAL_MODULES = ['dalfox_xss', 'sqlmap_check', 'controlled_validation'];

export default AgentToolRequestPanel;
