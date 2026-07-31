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
