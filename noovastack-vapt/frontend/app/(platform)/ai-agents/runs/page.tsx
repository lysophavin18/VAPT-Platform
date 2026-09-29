'use client';

import { useEffect, useState } from 'react';
import { Bot, Loader2, Play, Square, Trash2 } from 'lucide-react';
import { aiAgentsApi } from '@/api/ai-agents';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import type { AIAgent, AutonomousRun } from '@/types/ai-agent';

export default function AutonomousRunsPage() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [runs, setRuns] = useState<AutonomousRun[]>([]);
  const [projectId, setProjectId] = useState('');
  const [objective, setObjective] = useState('');
  const [agentId, setAgentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRuns() {
    try {
      setRuns(await aiAgentsApi.getRuns());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load runs');
    }
  }

  useEffect(() => {
    aiAgentsApi.getAgents().then(setAgents).catch(() => undefined);
    void loadRuns();
    const timer = window.setInterval(() => void loadRuns(), 8000);
    return () => window.clearInterval(timer);
  }, []);

  async function runAgent() {
    setBusy(true);
    setError(null);
    try {
      await aiAgentsApi.runAgent(agentId, { project_id: projectId, objective, max_actions: 5 });
      setObjective('');
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start autonomous run');
    } finally {
      setBusy(false);
    }
  }

  async function stopRun(runId: string) {
    try {
      await aiAgentsApi.stopRun(runId);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to stop run');
    }
  }

  const active = runs.filter((run) => ['queued', 'running', 'planning', 'awaiting_approval'].includes(run.status));

  return (
    <>
      <PageHeader
        title="Autonomous Pentest Agents"
        description="DeepSeek-driven agents plan a bounded authorized assessment and execute every action through the controlled scan gate."
      />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="p-6">
          <h2 className="font-semibold">Launch Autonomous Run</h2>
          <div className="mt-4 space-y-4">
            <Field label="Agent">
              <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">Choose agent</option>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </Select>
            </Field>
            <Field label="Project ID">
              <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="UUID of an authorized project" />
            </Field>
            <Field label="Objective">
              <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Assess the public web app for security misconfigurations using safe checks only." />
            </Field>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button onClick={runAgent} disabled={busy || !agentId || !projectId || !objective.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start Autonomous Run
            </Button>
            <p className="text-xs text-slate-500">High-risk actions automatically require human approval. The agent only uses approved in-scope assets.</p>
          </div>
        </Card>

        <div className="space-y-4">
          {active.length > 0 ? (
            <Card className="p-4">
              <h3 className="font-semibold">Active Runs</h3>
              <div className="mt-2 space-y-2">
                {active.map((run) => <RunRow key={run.id} run={run} onStop={stopRun} />)}
              </div>
            </Card>
          ) : null}

          <Card className="p-4">
            <h3 className="font-semibold">Run History</h3>
            {runs.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No autonomous runs yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {runs.map((run) => <RunRow key={run.id} run={run} onStop={stopRun} />)}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function RunRow({ run, onStop }: { run: AutonomousRun; onStop: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const stopped = ['stopped', 'completed', 'failed'].includes(run.status);
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-4 w-4 text-[#155EEF]" />
        <span className="text-sm font-semibold">{run.agent_name ?? run.agent_slug}</span>
        <StatusBadge value={run.status} />
        {!stopped ? <Button variant="outline" onClick={() => onStop(run.id)}><Square className="h-3 w-3" /> Stop</Button> : null}
        <button onClick={() => setExpanded(!expanded)} className="ml-auto text-xs text-[#155EEF]">{expanded ? 'Hide' : 'Details'}</button>
      </div>
      <p className="mt-1 text-sm text-slate-600">{run.objective}</p>
      <p className="text-xs text-slate-400">Started {run.started_at ? new Date(run.started_at).toLocaleString() : run.created_at ? new Date(run.created_at).toLocaleString() : 'pending'}</p>
      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {run.tasks.map((task) => (
            <div key={task.id} className="rounded-lg bg-slate-50 p-2 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge value={task.status} />
                <span className="font-medium">{task.title}</span>
                <span className="ml-auto text-xs text-slate-400">{task.risk_level}</span>
              </div>
              {task.result ? <p className="mt-1 text-xs text-slate-500">{task.result}</p> : null}
            </div>
          ))}
          {run.activities.map((activity) => (
            <p key={activity.id} className="text-xs text-slate-500"><span className="capitalize">{activity.status}</span> · {activity.message}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
