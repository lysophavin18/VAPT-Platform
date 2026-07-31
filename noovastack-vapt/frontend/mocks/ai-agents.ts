import type { AIAgent, AIAgentActivity, AIAgentAuditEvent, AIAgentEvidence, AIAgentMessage, AIAgentRecommendation, AIAgentSafetyControl, AIAgentTask } from '@/types/ai-agent';

export const mockAgents: AIAgent[] = [
  { id: 'engagement-planner', name: 'Engagement Planner', type: 'Planner', purpose: 'Plans and scopes assessments', description: 'Builds authorized assessment plans and maps work to OWASP methodology.', status: 'Running', currentTask: 'Generating assessment plan', engagement: 'ENG-2025-041', riskLevel: 'Low', lastActivity: '2 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '22 sec ago' },
  { id: 'asset-discovery', name: 'Asset Discovery', type: 'Discovery', purpose: 'Discovers and normalizes assets', description: 'Runs scoped passive discovery and normalizes approved assets.', status: 'Running', currentTask: 'Finding subdomains', engagement: 'ENG-2025-041', riskLevel: 'Low', lastActivity: '1 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '18 sec ago' },
  { id: 'web-security-agent', name: 'Web Security Agent', type: 'Scanner', purpose: 'Web vulnerability analysis', description: 'Assists safe OWASP web testing and evidence normalization.', status: 'Running', currentTask: 'Testing access control', engagement: 'ENG-2025-041', riskLevel: 'Medium', lastActivity: '3 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '31 sec ago' },
  { id: 'api-security-agent', name: 'API Security Agent', type: 'Scanner', purpose: 'API security assessment', description: 'Reviews API inventory, authorization boundaries, schemas, and tokens.', status: 'Running', currentTask: 'Analyzing endpoints', engagement: 'ENG-2025-041', riskLevel: 'Medium', lastActivity: '4 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '41 sec ago' },
  { id: 'evidence-validator', name: 'Evidence Validator', type: 'Validator', purpose: 'Validates evidence integrity', description: 'Checks evidence ownership, redaction, reproducibility, and hash integrity.', status: 'Reviewing', currentTask: 'Validate evidence EVID-124', engagement: 'ENG-2025-041', riskLevel: 'Low', lastActivity: '5 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '55 sec ago' },
  { id: 'finding-judge', name: 'Finding Judge', type: 'Validator', purpose: 'Validates findings and risk', description: 'Checks duplicate status, severity rationale, and report eligibility.', status: 'Reviewing', currentTask: 'Review finding FND-089', engagement: 'ENG-2025-041', riskLevel: 'High', lastActivity: '6 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '1 min ago' },
  { id: 'remediation-advisor', name: 'Remediation Advisor', type: 'Advisor', purpose: 'Suggests fixes and mitigations', description: 'Drafts immediate mitigations, long-term remediation, and verification steps.', status: 'Completed', currentTask: 'Generate remediation', engagement: 'ENG-2025-038', riskLevel: 'Low', lastActivity: '12 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '2 min ago' },
  { id: 'report-writer', name: 'Report Writer', type: 'Writer', purpose: 'Drafts report content', description: 'Creates tool-neutral report sections from verified findings and evidence.', status: 'Running', currentTask: 'Writing executive summary', engagement: 'ENG-2025-041', riskLevel: 'Low', lastActivity: '1 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '12 sec ago' },
  { id: 'retest-analyst', name: 'Retest Analyst', type: 'Validator', purpose: 'Compares retest results', description: 'Compares remediation retest evidence against prior verified behavior.', status: 'Idle', currentTask: 'No active task', riskLevel: 'Low', lastActivity: '38 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '5 min ago' },
  { id: 'security-context-agent', name: 'Security Context Agent', type: 'Context', purpose: 'Enriches findings with approved security context', description: 'Adds approved architecture, business, and control context without expanding scope.', status: 'Idle', currentTask: 'No active task', riskLevel: 'Low', lastActivity: '44 min ago', model: 'qwen3-coder:30b-64k', provider: 'Ollama', promptVersion: 'pv-2025.04', policyVersion: 'ASI-2025.07', lastHeartbeat: '6 min ago' },
];

export const mockActivities: AIAgentActivity[] = [
  { id: 'act-1', timestamp: '2 min ago', agentName: 'Web Security Agent', activity: 'Testing /admin/users endpoint', status: 'Running' },
  { id: 'act-2', timestamp: '3 min ago', agentName: 'API Security Agent', activity: 'Analyzing POST /api/login', status: 'Running' },
  { id: 'act-3', timestamp: '5 min ago', agentName: 'Evidence Validator', activity: 'Evidence EVID-124 under review', status: 'Reviewing' },
  { id: 'act-4', timestamp: '6 min ago', agentName: 'Finding Judge', activity: 'Review finding FND-089', status: 'Reviewing' },
  { id: 'act-5', timestamp: '12 min ago', agentName: 'Remediation Advisor', activity: 'Generated remediation for FND-082', status: 'Completed' },
];

export const mockSafetyControls: AIAgentSafetyControl[] = [
  ['ASI01', 'Goal Hijack', 'Prevents target content and retrieved documents from changing authorized assessment goals.'],
  ['ASI02', 'Tool Misuse', 'Validates tool calls, parameters, timeouts, and output limits.'],
  ['ASI03', 'Privilege Abuse', 'Enforces least privilege and separation of duties.'],
  ['ASI04', 'Supply Chain', 'Tracks approved model, plugin, package, template, and container versions.'],
  ['ASI05', 'Code Execution', 'Blocks unapproved code execution and target-provided scripts.'],
  ['ASI06', 'Context Poisoning', 'Separates untrusted observations from verified engagement memory.'],
  ['ASI07', 'Inter-Agent Communication', 'Authenticates task messages and prevents scope expansion between workers.'],
  ['ASI08', 'Cascading Failures', 'Applies timeouts, retries, circuit breakers, and instability stops.'],
  ['ASI09', 'Trust Exploitation', 'Requires neutral risk language and human review for significant actions.'],
  ['ASI10', 'Rogue Agents', 'Requires registered identities, kill switch compliance, and health checks.'],
].map(([id, name, description]) => ({ id, name: `${id} ${name}`, description, status: 'Healthy', lastCheck: '1 min ago', relatedAgents: ['Web Security Agent', 'Finding Judge'], detectedEvents: 0, policyVersion: 'ASI-2025.07', recommendedAction: 'No action required.' }));

export const mockRecommendations: AIAgentRecommendation[] = [
  { id: 'FND-089', title: 'Broken Object-Level Authorization', severity: 'High', agent: 'Finding Judge', age: '6 min ago', reason: 'Object ownership checks require review before report inclusion.', evidenceUsed: ['EVID-124'], confidence: 86, reviewStatus: 'Pending' },
  { id: 'FND-082', title: 'Sensitive Data Exposure', severity: 'Medium', agent: 'Evidence Validator', age: '12 min ago', reason: 'Response body appears to include sensitive metadata.', evidenceUsed: ['EVID-118'], confidence: 78, reviewStatus: 'Pending' },
  { id: 'FND-075', title: 'Missing Security Headers', severity: 'Low', agent: 'Web Security Agent', age: '18 min ago', reason: 'Security headers are absent on the root application response.', evidenceUsed: ['EVID-097'], confidence: 92, reviewStatus: 'Pending' },
];

export const mockTasks: AIAgentTask[] = [
  { id: 'TASK-301', objective: 'Validate object authorization', engagement: 'ENG-2025-041', target: '/api/users/{id}', risk: 'High', status: 'Reviewing', controlStatus: 'Reviewing', started: '09:20', duration: '8m', result: 'Under review' },
  { id: 'TASK-302', objective: 'Draft executive summary', engagement: 'ENG-2025-041', target: 'Report', risk: 'Low', status: 'Running', controlStatus: 'Standard', started: '09:21', duration: '7m', result: 'In progress' },
  { id: 'TASK-303', objective: 'Normalize evidence manifest', engagement: 'ENG-2025-041', target: 'EVID-124', risk: 'Low', status: 'Completed', controlStatus: 'Validated', started: '09:05', duration: '11m', result: 'Complete' },
];

export const mockEvidence: AIAgentEvidence[] = [
  { id: 'EVID-124', findingId: 'FND-089', type: 'http_response', source: 'Scan 24a8e61e', captureTime: '2026-07-20 09:10', hash: 'sha256:9c1f...a42b', redactionStatus: 'Redacted', preview: 'GET /admin/users returned role-bound response metadata.' },
  { id: 'EVID-118', findingId: 'FND-082', type: 'http_response', source: 'Scan 24a8e61e', captureTime: '2026-07-20 09:04', hash: 'sha256:8a9d...cc20', redactionStatus: 'Redacted', preview: 'Response body contained sensitive debug fields.' },
];

export const mockMessages: AIAgentMessage[] = [
  { id: 'MSG-1', sender: 'Web Security Agent', receiver: 'Evidence Validator', taskId: 'TASK-301', messageType: 'Evidence summary', timestamp: '2 min ago', validationStatus: 'Validated' },
  { id: 'MSG-2', sender: 'Finding Judge', receiver: 'Report Writer', taskId: 'TASK-302', messageType: 'Finding summary', timestamp: '5 min ago', validationStatus: 'Pending' },
];

export const mockAuditEvents: AIAgentAuditEvent[] = [
  { id: 'AUD-1', agentId: 'web-security-agent', actor: 'system', action: 'heartbeat', timestamp: '1 min ago', details: 'Agent heartbeat healthy.' },
  { id: 'AUD-2', agentId: 'finding-judge', actor: 'admin@noovastack.local', action: 'review_started', timestamp: '6 min ago', details: 'Human review started for FND-089.' },
];
