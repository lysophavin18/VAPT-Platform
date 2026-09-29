export type AIAgentType = 'Planner' | 'Discovery' | 'Scanner' | 'Validator' | 'Advisor' | 'Writer' | 'Context';
export type AIAgentStatus = 'Running' | 'Reviewing' | 'Completed' | 'Idle' | 'Paused' | 'Failed' | 'Blocked' | 'Isolated' | 'Offline';
export type AIAgentRisk = 'Low' | 'Medium' | 'High' | 'Critical';

export interface AIAgent {
  id: string;
  name: string;
  type: AIAgentType;
  purpose: string;
  description: string;
  status: AIAgentStatus;
  currentTask: string;
  engagement?: string;
  riskLevel: AIAgentRisk;
  lastActivity: string;
  model: string;
  provider: string;
  promptVersion: string;
  policyVersion: string;
  lastHeartbeat: string;
}

export interface AIAgentTask {
  id: string;
  objective: string;
  engagement: string;
  target: string;
  risk: AIAgentRisk;
  status: AIAgentStatus;
  controlStatus: 'Standard' | 'Reviewing' | 'Validated' | 'Rejected';
  started: string;
  duration: string;
  result: string;
}

export interface AIAgentRecommendation {
  id: string;
  title: string;
  severity: AIAgentRisk;
  agent: string;
  age: string;
  reason: string;
  evidenceUsed: string[];
  confidence: number;
  reviewStatus: 'Pending' | 'Accepted' | 'Rejected' | 'Needs Evidence';
}

export interface AIAgentActivity {
  id: string;
  timestamp: string;
  agentName: string;
  activity: string;
  status: AIAgentStatus;
}

export interface AIAgentEvidence {
  id: string;
  findingId: string;
  type: string;
  source: string;
  captureTime: string;
  hash: string;
  redactionStatus: 'Redacted' | 'Pending' | 'Rejected';
  preview: string;
}

export interface AIAgentMessage {
  id: string;
  sender: string;
  receiver: string;
  taskId: string;
  messageType: string;
  timestamp: string;
  validationStatus: 'Validated' | 'Pending' | 'Rejected';
}

export interface AIAgentSafetyControl {
  id: string;
  name: string;
  description: string;
  status: 'Healthy' | 'Warning' | 'Failed';
  lastCheck: string;
  relatedAgents: string[];
  detectedEvents: number;
  policyVersion: string;
  recommendedAction: string;
}

export interface AIAgentPolicy {
  id: string;
  version: string;
  mandatoryControls: string[];
  maxRiskLevel: AIAgentRisk;
}

export interface AIAgentPromptVersion {
  id: string;
  version: string;
  status: 'Approved' | 'Draft' | 'Retired';
}

export interface AIAgentAuditEvent {
  id: string;
  agentId: string;
  actor: string;
  action: string;
  timestamp: string;
  details: string;
}

export interface AutonomousRunTask {
  id: string;
  run_id: string;
  title: string | null;
  target: string | null;
  module: string;
  risk_level: string;
  status: string;
  scan_id: string | null;
  result: string | null;
  created_at: string | null;
}

export interface AutonomousRunActivity {
  id: string;
  run_id: string;
  message: string;
  status: string;
  created_at: string | null;
}

export interface AutonomousRun {
  id: string;
  agent_id: string;
  agent_slug: string | null;
  agent_name: string | null;
  project_id: string;
  engagement_id: string | null;
  objective: string | null;
  status: string;
  plan: Record<string, unknown> | null;
  celery_task_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  tasks: AutonomousRunTask[];
  activities: AutonomousRunActivity[];
}
