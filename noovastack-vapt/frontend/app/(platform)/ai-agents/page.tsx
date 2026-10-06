'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import {
  AlertTriangle, Archive, Bot, CheckCircle2, ChevronRight, Clock,
  Copy, FileText, Info, Loader2, Menu, MessageSquarePlus, MoreHorizontal,
  Pin, RefreshCw, Search, Send, ShieldCheck, Sparkles, Square,
  Trash2, XCircle, Zap,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { useEngagements } from '@/hooks/use-engagements';
import { MarkdownLite } from '@/lib/markdown-lite';
import type { User } from '@/types';

const PRIMARY_MODEL = 'deepseek-v4-flash';
const HISTORY_KEY_PREFIX = 'noovastack.security.chatHistory';
const MAX_INPUT = 12000;

const modes = [
  { id: 'general',           label: 'Ask Assistant',  emoji: '💬', color: 'from-violet-500 to-indigo-500',  tip: 'Ask platform and security workflow questions.',        prompt: 'Explain what evidence I need before validating this issue.' },
  { id: 'assessment_planner',label: 'Plan Assessment', emoji: '🗺️', color: 'from-blue-500 to-cyan-500',      tip: 'Create a safe VAPT plan from approved scope.',        prompt: 'Help me create a safe assessment plan.' },
  { id: 'finding_review',    label: 'Review Finding', emoji: '🔍', color: 'from-amber-500 to-orange-500',   tip: 'Review evidence and explain what is missing.',         prompt: 'Review this finding and tell me what is missing.' },
  { id: 'remediation',       label: 'Suggest Fix',    emoji: '🔧', color: 'from-emerald-500 to-teal-500',   tip: 'Draft mitigation, long-term fix, and verification.',  prompt: 'Suggest remediation for this vulnerability.' },
  { id: 'report_writer',     label: 'Write Report',   emoji: '📝', color: 'from-pink-500 to-rose-500',      tip: 'Improve report language for all audiences.',          prompt: 'Write a technical summary for my report.' },
  { id: 'retest_review',     label: 'Review Retest',  emoji: '✅', color: 'from-slate-500 to-gray-500',     tip: 'Compare original and retest evidence.',               prompt: 'Compare the original and retest evidence.' },
];

const MODE_SUGGESTIONS: Record<string, { label: string; prompt: string; icon: typeof Bot }[]> = {
  general:            [{ label: 'Plan assessment', prompt: 'Help me create a safe assessment plan.', icon: ShieldCheck }, { label: 'Required evidence', prompt: 'Explain what evidence I need before validating this issue.', icon: FileText }, { label: 'Scope rules', prompt: 'What activities are blocked by default?', icon: Info }],
  assessment_planner: [{ label: 'Plan scope', prompt: 'Help me create a safe assessment plan.', icon: ShieldCheck }, { label: 'Engagement checklist', prompt: 'What do I need before authorizing an engagement?', icon: CheckCircle2 }, { label: 'Blocked activities', prompt: 'What testing activities are blocked?', icon: AlertTriangle }],
  finding_review:     [{ label: 'Missing evidence', prompt: 'Review this finding and tell me what is missing.', icon: FileText }, { label: 'Severity check', prompt: 'Is the suggested severity justified?', icon: Info }, { label: 'Reject finding', prompt: 'Reject this finding and explain why.', icon: XCircle }],
  remediation:        [{ label: 'Immediate fix', prompt: 'What is the immediate mitigation?', icon: ShieldCheck }, { label: 'Verification', prompt: 'How do I verify the remediation?', icon: CheckCircle2 }, { label: 'References', prompt: 'Provide remediation references.', icon: FileText }],
  report_writer:      [{ label: 'Executive summary', prompt: 'Write an executive summary.', icon: FileText }, { label: 'Technical detail', prompt: 'Write technical findings detail.', icon: Info }, { label: 'Improve language', prompt: 'Improve the report language.', icon: Sparkles }],
  retest_review:      [{ label: 'Compare evidence', prompt: 'Compare original and retest evidence.', icon: FileText }, { label: 'Retest status', prompt: 'Is the finding fixed?', icon: CheckCircle2 }, { label: 'Still vulnerable', prompt: 'Explain why it is still vulnerable.', icon: AlertTriangle }],
};

const evidenceSchema = z.object({ id: z.string().optional(), type: z.string().optional(), source: z.string().optional(), captured: z.string().optional(), redaction_status: z.string().optional(), integrity_status: z.string().optional() }).passthrough();
const toolCallSchema = z.object({ name: z.string().optional(), parameters: z.record(z.unknown()).optional(), status: z.string().optional(), duration: z.string().optional(), output_reference: z.string().optional() }).passthrough();
const assistantContentSchema = z.object({
  type: z.string().optional(), message: z.string().optional(), summary: z.string().optional(), status: z.string().optional(), recommendation: z.string().optional(), suggested_severity: z.string().optional(), severity: z.string().optional(), owasp_category: z.string().optional(), cwe: z.string().optional(), evidence_ids: z.array(z.string()).optional(), evidence: z.array(evidenceSchema).optional(), missing_information: z.array(z.string()).optional(),
  remediation: z.object({ issue_summary: z.string().optional(), immediate_mitigation: z.array(z.string()).optional(), long_term_remediation: z.array(z.string()).optional(), verification_steps: z.array(z.string()).optional(), references: z.array(z.string()).optional() }).partial().optional(),
  report: z.object({ current_content: z.string().optional(), ai_suggestion: z.string().optional() }).partial().optional(),
  warnings: z.array(z.string()).optional(), tool_calls: z.array(toolCallSchema).optional(), human_review_required: z.boolean().optional(), access_level: z.string().optional(),
}).passthrough();

type AssistantContent = z.infer<typeof assistantContentSchema>;
type ChatMessage = { id: string; role: 'user' | 'assistant' | 'error'; content: string | AssistantContent; mode?: string; model?: string; createdAt: string; raw?: unknown; parserWarning?: string };
type ChatSession = { id: string; title: string; mode: string; messages: ChatMessage[]; updatedAt: string; pinned?: boolean; archived?: boolean; contextProjectId?: string; contextEngagementId?: string; contextFindingId?: string };
type ContextPatch = Partial<Pick<ChatSession, 'contextProjectId' | 'contextEngagementId' | 'contextFindingId'>>;
type Health = { provider: string; model: string; context_window: string; deployment: string; available: boolean; status: string };

const welcomeMessage: ChatMessage = {
  id: 'welcome', role: 'assistant', mode: 'general', model: PRIMARY_MODEL, createdAt: new Date().toISOString(),
  content: { type: 'plain', message: "Hi! 👋 I'm your AI security copilot. Tell me about a target, a finding, or a fix you're working on — I'll help you plan safely, triage evidence, and turn vulnerabilities into actionable steps.\n\nI explain and recommend; a human always makes the final call on scope, findings, and reports.", human_review_required: false },
};

// ── helpers ───────────────────────────────────────────────────────────────────
function getUserHistoryKey(user: User | null | undefined) { return user ? `${HISTORY_KEY_PREFIX}.${user.id}` : `${HISTORY_KEY_PREFIX}.guest`; }
function createChatSession(): ChatSession { return { id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: 'New chat', mode: 'general', messages: [welcomeMessage], updatedAt: new Date().toISOString() }; }
function makeTitle(text: string) { return text.slice(0, 42).replace(/\s+/g, ' ').trim() + (text.length > 42 ? '…' : ''); }
function formatTime(iso: string) { try { const d = new Date(iso); const now = new Date(); const diff = (now.getTime() - d.getTime()) / 1000; if (diff < 60) return 'just now'; if (diff < 3600) return `${Math.floor(diff / 60)}m ago`; if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`; return d.toLocaleDateString(); } catch { return ''; } }
function groupSessions(sessions: ChatSession[]) { const groups: Record<string, ChatSession[]> = {}; const now = new Date(); sessions.filter(s => s.pinned).forEach(s => { (groups['📌 Pinned'] ??= []).push(s); }); sessions.filter(s => !s.pinned).forEach(s => { const d = new Date(s.updatedAt); const diff = (now.getTime() - d.getTime()) / 86400000; const key = diff < 1 ? 'Today' : diff < 2 ? 'Yesterday' : diff < 7 ? 'This week' : 'Earlier'; (groups[key] ??= []).push(s); }); return groups; }
function sortSessions(sessions: ChatSession[]) { return [...sessions].sort((a, b) => { if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1; return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(); }); }
function normalizeMessage(msg: ChatMessage): ChatMessage {
  if (msg.role === 'user' && typeof msg.content !== 'string') {
    const c = msg.content as Record<string, unknown>;
    const text = (c?.message ?? c?.text ?? c?.content ?? '') as string;
    return { ...msg, content: String(text) };
  }
  return msg;
}
function loadChatHistory(key: string): ChatSession[] { try { const raw = localStorage.getItem(key); if (!raw) return []; const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter(s => s.id && s.messages).map(s => ({ ...s, messages: s.messages.map(normalizeMessage) })) : []; } catch { return []; } }
function saveChatHistory(key: string, sessions: ChatSession[]) { try { localStorage.setItem(key, JSON.stringify(sessions.slice(0, 50))); } catch { /* quota */ } }
function labelForMode(id: string) { return modes.find(m => m.id === id)?.label ?? id; }
function emojiForMode(id: string) { return modes.find(m => m.id === id)?.emoji ?? '💬'; }

function parseAssistantResponse(text: string): { content: AssistantContent; warning?: string } {
  if (!text || text === '__STREAMING__') return { content: { type: 'streaming' } as AssistantContent };
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { const parsed = assistantContentSchema.parse(JSON.parse(cleaned)); return { content: parsed }; }
  catch { /* not JSON */ }
  return { content: { type: 'plain', message: text } as AssistantContent };
}

function getChatErrorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}
function getChatErrorKind(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return 'Unauthorized';
  if (error instanceof ApiError && error.status === 503) return 'Unavailable';
  return 'Error';
}
function buildAuthErrorMessage(): ChatMessage {
  return { id: `err-${Date.now()}`, role: 'error', content: 'Session expired. Please refresh and log in again.', createdAt: new Date().toISOString() };
}
function useDeviceClass() { const [cls, setCls] = useState<'mobile' | 'tablet' | 'desktop'>('desktop'); useEffect(() => { const update = () => setCls(window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop'); update(); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []); return cls; }

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SecurityAssistantPage() {
  const { token, user, loading: authLoading } = useAuth();
  const historyKey = useMemo(() => getUserHistoryKey(user), [user]);
  const initialSessionRef = useRef<ChatSession | null>(null);
  if (!initialSessionRef.current) initialSessionRef.current = createChatSession();
  const [sessions, setSessions] = useState<ChatSession[]>(() => [initialSessionRef.current as ChatSession]);
  const [activeId, setActiveId] = useState(() => (initialSessionRef.current as ChatSession).id);
  const [mode, setMode] = useState('general');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [search, setSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingTextRef = useRef('');
  const lastUserPromptRef = useRef('');

  const activeSession = sessions.find(s => s.id === activeId) ?? sessions[0];
  const activeMode = modes.find(m => m.id === mode) ?? modes[0];
  const authorizationAvailable = Boolean(token) && !authLoading;

  useEffect(() => { const saved = loadChatHistory(historyKey); const next = saved.length ? saved : [createChatSession()]; setSessions(next); setActiveId(next[0].id); }, [historyKey]);
  useEffect(() => { saveChatHistory(historyKey, sessions); }, [historyKey, sessions]);
  useEffect(() => { if (activeSession) setMode(activeSession.mode); }, [activeSession?.id]);
  useEffect(() => { if (!token) return; api.localAiHealth(token).then(setHealth).catch(() => setHealth({ provider: 'opencode', model: PRIMARY_MODEL, context_window: '64K', deployment: 'Cloud', available: false, status: 'unavailable' })); }, [token]);

  async function sendMessage(event?: FormEvent, forcedText?: string) {
    event?.preventDefault();
    const text = (forcedText ?? prompt).trim();
    if (!token) { updateActiveSession(s => ({ ...s, messages: [...s.messages, buildAuthErrorMessage()], updatedAt: new Date().toISOString() })); return; }
    if (!text || loading || !authorizationAvailable) return;
    lastUserPromptRef.current = text;
    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: text, mode, createdAt: new Date().toISOString() };
    updateActiveSession(s => ({ ...s, title: s.title === 'New chat' ? makeTitle(text) : s.title, messages: [...s.messages, userMessage], updatedAt: new Date().toISOString() }));
    if (!forcedText) setPrompt('');
    setLoading(true);
    abortRef.current = new AbortController();
    const assistantId = `msg-${Date.now()}`;
    streamingMessageIdRef.current = assistantId;
    streamingTextRef.current = '';
    const assistantMessage: ChatMessage = { id: assistantId, role: 'assistant', content: '__STREAMING__', mode, model: PRIMARY_MODEL, createdAt: new Date().toISOString() };
    updateActiveSession(s => ({ ...s, messages: [...s.messages, assistantMessage], updatedAt: new Date().toISOString() }));
    try {
      await api.localAiChatStream({ prompt: text, mode, model: PRIMARY_MODEL, conversation_id: activeSession.id, project_id: activeSession.contextProjectId, engagement_id: activeSession.contextEngagementId, finding_id: activeSession.contextFindingId }, token, abortRef.current.signal, (chunk) => {
        if (chunk.type === 'token' && chunk.token) { streamingTextRef.current += chunk.token; }
        else if (chunk.type === 'error') { throw new ApiError(502, chunk.error || 'Stream failed.'); }
      });
      const parsed = parseAssistantResponse(streamingTextRef.current);
      updateActiveSession(s => ({ ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, content: parsed.content, raw: streamingTextRef.current, parserWarning: parsed.warning } : m), updatedAt: new Date().toISOString() }));
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      updateActiveSession(s => ({ ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, content: { type: 'error', status: getChatErrorKind(error), message: getChatErrorText(error) } } : m), updatedAt: new Date().toISOString() }));
    } finally {
      setLoading(false); abortRef.current = null; streamingMessageIdRef.current = null; streamingTextRef.current = '';
    }
  }

  function updateActiveSession(updater: (s: ChatSession) => ChatSession) { setSessions(curr => sortSessions(curr.map(s => s.id === activeId ? updater(s) : s))); }
  function changeMode(next: string) { setMode(next); updateActiveSession(s => ({ ...s, mode: next, updatedAt: new Date().toISOString() })); }
  function startNewChat() { const s = createChatSession(); setSessions(curr => [s, ...curr]); setActiveId(s.id); setMode(s.mode); setPrompt(''); }
  function stopGeneration() { abortRef.current?.abort(); setLoading(false); }
  function deleteSession(id: string) { if (!window.confirm('Delete this conversation?')) return; const rem = sessions.filter(s => s.id !== id); const next = rem.length ? rem : [createChatSession()]; setSessions(next); if (id === activeId) setActiveId(next[0].id); }
  function renameSession(id: string) { const name = window.prompt('Rename conversation'); if (!name?.trim()) return; setSessions(curr => curr.map(s => s.id === id ? { ...s, title: name.trim(), updatedAt: new Date().toISOString() } : s)); }
  function patchSession(id: string, patch: Partial<ChatSession>) { setSessions(curr => sortSessions(curr.map(s => s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s))); }
  function retryLastMessage() { if (lastUserPromptRef.current) sendMessage(undefined, lastUserPromptRef.current); }
  function setSessionContext(patch: ContextPatch) { updateActiveSession(s => ({ ...s, ...patch, updatedAt: new Date().toISOString() })); }

  return (
    <main className="min-h-[calc(100vh-88px)] bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {showHistory && <button aria-label="Close drawer" className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setShowHistory(false)} />}
      <div className="flex h-[calc(100dvh-88px)] overflow-hidden">
        {/* Sidebar */}
        <aside className={`${showHistory ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'} w-[300px] shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 lg:static lg:flex`}>
          <div className="flex items-center justify-between p-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100">Conversations</span>
            </div>
            <div className="flex gap-1">
              <button className="lg:hidden grid h-7 w-7 place-items-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:bg-gray-800" onClick={() => setShowHistory(false)}><XCircle className="h-4 w-4" /></button>
              <button onClick={startNewChat} className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm hover:opacity-90 transition-opacity" title="New chat"><MessageSquarePlus className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <div className="mx-3 mb-3">
            <label className="flex h-9 items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-3 transition-all focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/20">
              <Search className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats…" className="w-full bg-transparent text-[12.5px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:text-gray-500 outline-none" />
            </label>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1 [scrollbar-width:thin]">
            {(() => {
              const filtered = sessions.filter(s => !s.archived && s.title.toLowerCase().includes(search.toLowerCase()));
              const groups = groupSessions(filtered);
              const entries = Object.entries(groups).filter(([, rows]) => rows.length);
              if (!entries.length) return <p className="px-3 py-6 text-center text-[12px] text-gray-500 dark:text-gray-400">No conversations found</p>;
              return entries.map(([group, rows], gi) => (
                <div key={group}>
                  {gi > 0 && <div className="mx-2 my-2 h-px bg-gray-200 dark:bg-gray-700" />}
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{group}</p>
                  {rows.map(session => (
                    <SidebarItem key={session.id} session={session} active={session.id === activeId}
                      onSelect={() => { setActiveId(session.id); setShowHistory(false); }}
                      onRename={() => renameSession(session.id)}
                      onDelete={() => deleteSession(session.id)}
                      onPin={() => patchSession(session.id, { pinned: !session.pinned })}
                      onArchive={() => patchSession(session.id, { archived: true })}
                    />
                  ))}
                </div>
              ));
            })()}
          </div>
        </aside>

        {/* Main chat area */}
        <section className="flex min-w-0 flex-1 flex-col bg-gray-50 dark:bg-gray-950">

          {/* Header */}
          <header className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/80 backdrop-blur-sm px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-gray-100" onClick={() => setShowHistory(true)}><Menu className="h-5 w-5" /></button>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow">
                  <Zap className="h-4.5 w-4.5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 truncate">NoovaStack AI Assistant</h1>
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${health?.available ? 'bg-emerald-500/15 text-emerald-600' : health ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-600'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${health?.available ? 'bg-emerald-500 animate-pulse' : health ? 'bg-red-500' : 'bg-amber-500'}`} />
                      {health?.available ? 'Connected' : health ? 'Unavailable' : 'Checking…'}
                    </span>
                  </div>
                  {health?.model && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{health.model} · {health.provider}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ContextSelector session={activeSession} onContextChange={setSessionContext} />

                <button onClick={startNewChat} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:opacity-90 transition-opacity">
                  <MessageSquarePlus className="h-3.5 w-3.5" /> New Chat
                </button>
              </div>
            </div>
          </header>

          {/* Mode tabs */}
          <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 px-4">
            <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {modes.map(m => (
                <button key={m.id} onClick={() => changeMode(m.id)} title={m.tip}
                  className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-medium transition-all ${mode === m.id ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:bg-gray-800 hover:text-gray-900 dark:text-gray-100'}`}>
                  <span className="text-[13px]">{m.emoji}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <MessageList messages={activeSession.messages} loading={loading} mode={activeMode} user={user} onUsePrompt={setPrompt} onRetry={retryLastMessage} />

          {/* Composer */}
          <Composer value={prompt} setValue={setPrompt} onSubmit={sendMessage} onStop={stopGeneration} loading={loading} disabled={!authorizationAvailable} authLoading={authLoading} mode={activeMode} />
        </section>
      </div>
    </main>
  );
}

// ── Sidebar item ──────────────────────────────────────────────────────────────
function SidebarItem({ session, active, onSelect, onRename, onDelete, onPin, onArchive }: { session: ChatSession; active: boolean; onSelect: () => void; onRename: () => void; onDelete: () => void; onPin: () => void; onArchive: () => void }) {
  return (
    <div className={`group relative rounded-xl px-3 py-2 cursor-pointer transition-all ${active ? 'bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-400/30' : 'border border-transparent hover:bg-gray-100 dark:bg-gray-800'}`} onClick={onSelect}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px]">{emojiForMode(session.mode)}</span>
            <span className="truncate text-[12.5px] font-semibold text-gray-900 dark:text-gray-100">{session.title}</span>
            {session.pinned && <Pin className="h-2.5 w-2.5 shrink-0 text-violet-500" />}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <Clock className="h-2.5 w-2.5 shrink-0" />{formatTime(session.updatedAt)}
          </div>
        </div>
      </div>
      <div className="absolute right-2 top-2 hidden gap-0.5 group-hover:flex" onClick={e => e.stopPropagation()}>
        <IconBtn label="Rename" icon={MoreHorizontal} onClick={onRename} />
        <IconBtn label={session.pinned ? 'Unpin' : 'Pin'} icon={Pin} onClick={onPin} />
        <IconBtn label="Archive" icon={Archive} onClick={onArchive} />
        <IconBtn label="Delete" icon={Trash2} onClick={onDelete} danger />
      </div>
    </div>
  );
}

function IconBtn({ label, icon: Icon, onClick, danger }: { label: string; icon: typeof Bot; onClick: () => void; danger?: boolean }) {
  return (
    <button aria-label={label} onClick={onClick} className={`grid h-6 w-6 place-items-center rounded-lg transition-colors ${danger ? 'hover:bg-red-500/15 hover:text-red-500 text-gray-500 dark:text-gray-400' : 'hover:bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-gray-100'}`}>
      <Icon className="h-3 w-3" />
    </button>
  );
}

// ── Context selector ──────────────────────────────────────────────────────────
function ContextSelector({ session, onContextChange }: { session: ChatSession; onContextChange: (p: ContextPatch) => void }) {
  const { data: projects } = useProjects();
  const { data: engagements } = useEngagements(session.contextProjectId ?? undefined);
  const hasCtx = session.contextProjectId || session.contextEngagementId || session.contextFindingId;

  return (
    <div className="relative group">
      <button className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition-colors ${hasCtx ? 'border-violet-400/40 bg-violet-500/10 text-violet-600' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:bg-gray-800 hover:text-gray-900 dark:text-gray-100'}`}>
        <ChevronRight className="h-3.5 w-3.5" />
        {hasCtx ? 'Context set' : 'Set context'}
      </button>
      <div className="absolute right-0 top-full z-50 mt-2 hidden w-72 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-xl group-focus-within:block group-hover:block">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Session context</p>
        <CtxSelect label="Project" value={session.contextProjectId ?? ''} onChange={v => onContextChange({ contextProjectId: v || undefined, contextEngagementId: undefined })}
          options={(projects ?? []).map((p: { id: string; name: string }) => ({ value: p.id, label: p.name }))} />
        {session.contextProjectId && (
          <CtxSelect label="Engagement" value={session.contextEngagementId ?? ''} onChange={v => onContextChange({ contextEngagementId: v || undefined })}
            options={(engagements ?? []).map((e: { id: string; name: string }) => ({ value: e.id, label: e.name }))} />
        )}
        {hasCtx && <button onClick={() => onContextChange({ contextProjectId: undefined, contextEngagementId: undefined, contextFindingId: undefined })} className="mt-1 w-full rounded-lg py-1 text-[11px] text-red-500 hover:bg-red-500/10 transition-colors">Clear context</button>}
      </div>
    </div>
  );
}

function CtxSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="mb-2">
      <label className="mb-0.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-2 py-1.5 text-[12px] text-gray-900 dark:text-gray-100 outline-none focus:border-violet-400">
        <option value="">— none —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Message list ──────────────────────────────────────────────────────────────
function MessageList({ messages, loading, mode, user, onUsePrompt, onRetry }: { messages: ChatMessage[]; loading: boolean; mode: typeof modes[0]; user: User | null | undefined; onUsePrompt: (p: string) => void; onRetry: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, loading]);

  const suggestions = MODE_SUGGESTIONS[mode.id] ?? MODE_SUGGESTIONS.general;
  const onlyWelcome = messages.length === 1 && messages[0].id === 'welcome';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 [scrollbar-width:thin]">
      {messages.map(msg => {
        if (msg.role === 'user') return <UserBubble key={msg.id} message={msg} user={user} />;
        if (msg.role === 'error') return <ErrorBubble key={msg.id} message={msg} onRetry={onRetry} />;
        return <AssistantBubble key={msg.id} message={msg} mode={mode} onRetry={onRetry} />;
      })}

      {loading && !messages.some(m => m.role === 'assistant' && (m.content === '__STREAMING__' || (typeof m.content === 'object' && (m.content as AssistantContent).type === 'streaming'))) && (
        <div className="flex items-start gap-3">
          <AvatarBot />
          <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex gap-1 items-center">
              <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}

      {onlyWelcome && !loading && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {suggestions.map(s => (
            <button key={s.label} onClick={() => onUsePrompt(s.prompt)}
              className="flex items-center gap-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-left text-[12.5px] font-medium text-gray-900 dark:text-gray-100 hover:border-violet-400/40 hover:bg-violet-500/5 transition-all group">
              <s.icon className="h-4 w-4 shrink-0 text-violet-500 group-hover:scale-110 transition-transform" />
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function AvatarBot() {
  return (
    <div className="shrink-0 h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
      <Zap className="h-4 w-4 text-white" />
    </div>
  );
}

function AvatarUser({ user }: { user: User | null | undefined }) {
  const initials = user?.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? user?.username?.[0]?.toUpperCase() ?? '?';
  return (
    <div className="shrink-0 h-8 w-8 rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-sm text-white text-[11px] font-bold">
      {initials}
    </div>
  );
}

function UserBubble({ message, user }: { message: ChatMessage; user: User | null | undefined }) {
  const text = typeof message.content === 'string' ? message.content : '';
  const [copied, setCopied] = useState(false);
  function copy() { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }
  return (
    <div className="flex items-start justify-end gap-3">
      <div className="group max-w-[75%] relative">
        <div
          className="rounded-2xl rounded-tr-sm px-4 py-3 text-[13.5px] shadow-sm"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#ffffff' }}
        >
          <p className="whitespace-pre-wrap break-words">{text}</p>
        </div>
        <div className="mt-1 flex items-center justify-end gap-2">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatTime(message.createdAt)}</span>
          <button onClick={copy} className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-gray-100">
            {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>
      <AvatarUser user={user} />
    </div>
  );
}

function AssistantBubble({ message, mode, onRetry }: { message: ChatMessage; mode: typeof modes[0]; onRetry: () => void }) {
  const content = message.content;
  const [copied, setCopied] = useState(false);

  if (content === '__STREAMING__' || (typeof content === 'object' && (content as AssistantContent).type === 'streaming')) {
    return (
      <div className="flex items-start gap-3">
        <AvatarBot />
        <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex gap-1 items-center">
            <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
            <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
            <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    );
  }

  if (typeof content === 'object' && (content as AssistantContent).type === 'error') {
    const c = content as AssistantContent;
    return (
      <div className="flex items-start gap-3">
        <AvatarBot />
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-red-300/30 bg-red-500/10 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <span className="text-[12.5px] font-semibold text-red-500">{c.status ?? 'Error'}</span>
          </div>
          <p className="text-[12.5px] text-gray-900 dark:text-gray-100">{c.message}</p>
          <button onClick={onRetry} className="mt-2 flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-gray-100 transition-colors">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const c = typeof content === 'object' ? content as AssistantContent : null;
  const text = c?.message ?? c?.summary ?? (typeof content === 'string' ? content : '');
  function copyText() { navigator.clipboard.writeText(text ?? '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }

  return (
    <div className="flex items-start gap-3">
      <AvatarBot />
      <div className="group min-w-0 max-w-[80%]">
        <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3 shadow-sm">
          {/* Mode badge */}
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-[11px]">{mode.emoji}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{mode.label}</span>
            {c?.human_review_required && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-600">
                <AlertTriangle className="h-2.5 w-2.5" /> Needs review
              </span>
            )}
          </div>

          {/* Main text */}
          {text && <div className="text-[13.5px] leading-relaxed text-gray-900 dark:text-gray-100"><MarkdownLite text={text} /></div>}

          {/* Remediation card */}
          {c?.remediation && <RemediationCard r={c.remediation} />}

          {/* Missing info */}
          {c?.missing_information?.length ? (
            <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-400/20 px-3 py-2">
              <p className="mb-1 text-[11px] font-semibold text-amber-600">Missing information</p>
              <ul className="space-y-0.5">{c.missing_information.map((item, i) => <li key={i} className="flex items-start gap-1.5 text-[12px] text-gray-900 dark:text-gray-100"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />{item}</li>)}</ul>
            </div>
          ) : null}

          {/* Warnings */}
          {c?.warnings?.length ? (
            <div className="mt-3 rounded-xl bg-red-500/10 border border-red-400/20 px-3 py-2">
              <p className="mb-1 text-[11px] font-semibold text-red-500">Warnings</p>
              <ul className="space-y-0.5">{c.warnings.map((w, i) => <li key={i} className="text-[12px] text-gray-900 dark:text-gray-100">⚠ {w}</li>)}</ul>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="mt-1 flex items-center gap-2 px-1">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatTime(message.createdAt)}</span>
          {message.model && <span className="text-[10px] text-gray-500 dark:text-gray-400">· {message.model}</span>}
          <button onClick={copyText} className="ml-auto hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-gray-100">
            {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
          <button onClick={onRetry} className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-gray-100">
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RemediationCard({ r }: { r: NonNullable<AssistantContent['remediation']> }) {
  return (
    <div className="mt-3 space-y-2">
      {r.issue_summary && <p className="text-[12.5px] text-gray-900 dark:text-gray-100 italic border-l-2 border-violet-400 pl-3">{r.issue_summary}</p>}
      {r.immediate_mitigation?.length ? <RemedSection label="⚡ Immediate mitigation" items={r.immediate_mitigation} color="emerald" /> : null}
      {r.long_term_remediation?.length ? <RemedSection label="🔧 Long-term fix" items={r.long_term_remediation} color="blue" /> : null}
      {r.verification_steps?.length ? <RemedSection label="✅ Verification" items={r.verification_steps} color="violet" /> : null}
      {r.references?.length ? (
        <div className="rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 px-3 py-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">References</p>
          <ul className="space-y-0.5">{r.references.map((ref, i) => <li key={i} className="text-[11.5px] text-gray-900 dark:text-gray-100 break-all">{ref}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

function RemedSection({ label, items, color }: { label: string; items: string[]; color: string }) {
  const colors: Record<string, string> = { emerald: 'bg-emerald-500/10 border-emerald-400/20 text-emerald-700', blue: 'bg-blue-500/10 border-blue-400/20 text-blue-700', violet: 'bg-violet-500/10 border-violet-400/20 text-violet-700' };
  return (
    <div className={`rounded-xl border px-3 py-2 ${colors[color] ?? colors.violet}`}>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider">{label}</p>
      <ul className="space-y-0.5">{items.map((item, i) => <li key={i} className="text-[12px] text-gray-900 dark:text-gray-100">{item}</li>)}</ul>
    </div>
  );
}

function ErrorBubble({ message, onRetry }: { message: ChatMessage; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center">
      <div className="flex items-center gap-2 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-[12.5px] text-red-500">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{typeof message.content === 'string' ? message.content : 'An error occurred.'}</span>
        <button onClick={onRetry} className="ml-2 underline text-[11px]">Retry</button>
      </div>
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────
function Composer({ value, setValue, onSubmit, onStop, loading, disabled, authLoading, mode }: { value: string; setValue: (v: string) => void; onSubmit: (e?: FormEvent) => void; onStop: () => void; loading: boolean; disabled: boolean; authLoading: boolean; mode: typeof modes[0] }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = MODE_SUGGESTIONS[mode.id] ?? MODE_SUGGESTIONS.general;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [value]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  }

  return (
    <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/80 backdrop-blur-sm px-4 py-3">
      {/* Quick suggestions */}
      {!value && !loading && (
        <div className="mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {suggestions.map(s => (
            <button key={s.label} onClick={() => setValue(s.prompt)}
              className="shrink-0 flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-3 py-1 text-[11.5px] text-gray-500 dark:text-gray-400 hover:border-violet-400/40 hover:text-violet-600 transition-colors">
              <s.icon className="h-3 w-3" />{s.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex items-end gap-3">
        <div className="flex-1 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-4 py-3 transition-all focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/20">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            maxLength={MAX_INPUT}
            disabled={disabled || authLoading}
            placeholder={disabled ? (authLoading ? 'Authenticating…' : 'Please log in to chat') : `Ask the AI assistant… (${mode.emoji} ${mode.label})`}
            className="w-full resize-none bg-transparent text-[13.5px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:text-gray-500 outline-none disabled:opacity-50"
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{value.length}/{MAX_INPUT} · Shift+Enter for new line</span>
          </div>
        </div>

        {loading ? (
          <button type="button" onClick={onStop} className="shrink-0 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm">
            <Square className="h-4 w-4 fill-white" />
          </button>
        ) : (
          <button type="submit" disabled={!value.trim() || disabled} className="shrink-0 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
            <Send className="h-4 w-4" />
          </button>
        )}
      </form>
    </div>
  );
}
