'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { AlertTriangle, Archive, Bot, CheckCircle2, ChevronLeft, ChevronRight, Clock, Copy, FileText, History, Info, Loader2, Menu, MessageSquarePlus, MoreHorizontal, Paperclip, PauseCircle, Pin, RefreshCw, Search, Send, ShieldCheck, Sparkles, Trash2, Wrench, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { AgentToolRequestPanel } from '@/components/ai-agents/agent-tool-request-panel';
import { useAuth } from '@/hooks/use-auth';
import type { User } from '@/types';

const PRIMARY_MODEL = 'qwen3-coder:30b-64k';
const HISTORY_KEY_PREFIX = 'noovastack.security.chatHistory';
const MAX_INPUT = 12000;

const modes = [
  { id: 'general', label: 'Ask Assistant', tip: 'Ask platform and security workflow questions.', prompt: 'Explain what evidence I need before validating this issue.' },
  { id: 'assessment_planner', label: 'Plan Assessment', tip: 'Create a safe VAPT plan from approved scope.', prompt: 'Help me create a safe assessment plan.' },
  { id: 'finding_review', label: 'Review Finding', tip: 'Review evidence and explain what is missing.', prompt: 'Review this finding and tell me what is missing.' },
  { id: 'remediation', label: 'Suggest Fix', tip: 'Draft mitigation, long-term fix, and verification steps.', prompt: 'Suggest remediation for this vulnerability.' },
  { id: 'report_writer', label: 'Write Report', tip: 'Improve report language for technical and executive readers.', prompt: 'Write a technical summary for my report.' },
  { id: 'retest_review', label: 'Review Retest', tip: 'Compare original and retest evidence.', prompt: 'Compare the original and retest evidence.' },
];

const MODE_SUGGESTIONS: Record<string, { label: string; prompt: string; icon: typeof Bot }[]> = {
  general: [
    { label: 'Plan assessment', prompt: 'Help me create a safe assessment plan.', icon: ShieldCheck },
    { label: 'Required evidence', prompt: 'Explain what evidence I need before validating this issue.', icon: FileText },
    { label: 'Scope rules', prompt: 'What activities are blocked by default?', icon: Info },
  ],
  assessment_planner: [
    { label: 'Plan scope', prompt: 'Help me create a safe assessment plan.', icon: ShieldCheck },
    { label: 'Engagement checklist', prompt: 'What do I need before authorizing an engagement?', icon: CheckCircle2 },
    { label: 'Blocked activities', prompt: 'What testing activities are blocked?', icon: AlertTriangle },
  ],
  finding_review: [
    { label: 'Missing evidence', prompt: 'Review this finding and tell me what is missing.', icon: FileText },
    { label: 'Severity check', prompt: 'Is the suggested severity justified?', icon: Info },
    { label: 'Reject finding', prompt: 'Reject this finding and explain why.', icon: XCircle },
  ],
  remediation: [
    { label: 'Immediate fix', prompt: 'What is the immediate mitigation?', icon: ShieldCheck },
    { label: 'Verification', prompt: 'How do I verify the remediation?', icon: CheckCircle2 },
    { label: 'References', prompt: 'Provide remediation references.', icon: FileText },
  ],
  report_writer: [
    { label: 'Executive summary', prompt: 'Write an executive summary.', icon: FileText },
    { label: 'Technical detail', prompt: 'Write technical findings detail.', icon: Info },
    { label: 'Improve language', prompt: 'Improve the report language.', icon: Sparkles },
  ],
  retest_review: [
    { label: 'Compare evidence', prompt: 'Compare original and retest evidence.', icon: FileText },
    { label: 'Retest status', prompt: 'Is the finding fixed?', icon: CheckCircle2 },
    { label: 'Still vulnerable', prompt: 'Explain why it is still vulnerable.', icon: AlertTriangle },
  ],
};

const evidenceSchema = z.object({ id: z.string().optional(), type: z.string().optional(), source: z.string().optional(), captured: z.string().optional(), redaction_status: z.string().optional(), integrity_status: z.string().optional() }).passthrough();
const toolCallSchema = z.object({ name: z.string().optional(), parameters: z.record(z.unknown()).optional(), status: z.string().optional(), duration: z.string().optional(), output_reference: z.string().optional() }).passthrough();
const assistantContentSchema = z.object({
  type: z.string().optional(), message: z.string().optional(), summary: z.string().optional(), status: z.string().optional(), recommendation: z.string().optional(), suggested_severity: z.string().optional(), severity: z.string().optional(), owasp_category: z.string().optional(), cwe: z.string().optional(), evidence_ids: z.array(z.string()).optional(), evidence: z.array(evidenceSchema).optional(), missing_information: z.array(z.string()).optional(), remediation: z.object({ issue_summary: z.string().optional(), immediate_mitigation: z.array(z.string()).optional(), long_term_remediation: z.array(z.string()).optional(), verification_steps: z.array(z.string()).optional(), references: z.array(z.string()).optional() }).partial().optional(), report: z.object({ current_content: z.string().optional(), ai_suggestion: z.string().optional() }).partial().optional(), warnings: z.array(z.string()).optional(), tool_calls: z.array(toolCallSchema).optional(), human_review_required: z.boolean().optional(), access_level: z.string().optional(),
}).passthrough();

type AssistantContent = z.infer<typeof assistantContentSchema>;
type EvidenceItem = z.infer<typeof evidenceSchema>;
type ChatMessage = { id: string; role: 'user' | 'assistant' | 'error'; content: string | AssistantContent; mode?: string; model?: string; createdAt: string; raw?: unknown; parserWarning?: string };
type ChatSession = { id: string; title: string; mode: string; messages: ChatMessage[]; updatedAt: string; pinned?: boolean; archived?: boolean };
type Health = { provider: string; model: string; context_window: string; deployment: string; available: boolean; status: string };

const welcomeMessage: ChatMessage = { id: 'welcome', role: 'assistant', mode: 'general', model: PRIMARY_MODEL, createdAt: new Date().toISOString(), content: { type: 'plain', message: 'I can help review scan results, analyze evidence, improve findings, generate remediation, and draft report content using your local model. Select authorized context when available and keep human review in the approval path.', human_review_required: true } };

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
  const [showContext, setShowContext] = useState(false);
  const [toolRequestOpen, setToolRequestOpen] = useState(false);
  const device = useDeviceClass();
  const abortRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingTextRef = useRef('');
  const lastUserPromptRef = useRef('');

  const activeSession = sessions.find((session) => session.id === activeId) ?? sessions[0];
  const activeMode = modes.find((item) => item.id === mode) ?? modes[0];
  const authorizationAvailable = Boolean(token) && !authLoading;

  useEffect(() => {
    const saved = loadChatHistory(historyKey);
    const next = saved.length ? saved : [createChatSession()];
    setSessions(next);
    setActiveId(next[0].id);
  }, [historyKey]);
  useEffect(() => { saveChatHistory(historyKey, sessions); }, [historyKey, sessions]);
  useEffect(() => { if (activeSession) setMode(activeSession.mode); }, [activeSession?.id]);
  useEffect(() => { if (!token) return; api.localAiHealth(token).then(setHealth).catch(() => setHealth({ provider: 'ollama', model: PRIMARY_MODEL, context_window: '64K', deployment: 'Local', available: false, status: 'unavailable' })); }, [token]);


  async function sendMessage(event?: FormEvent, forcedText?: string) {
    event?.preventDefault();
    const text = (forcedText ?? prompt).trim();
    if (!token) {
      updateActiveSession((session) => ({ ...session, messages: [...session.messages, buildAuthErrorMessage()], updatedAt: new Date().toISOString() }));
      return;
    }
    if (!text || loading || !authorizationAvailable) return;
    lastUserPromptRef.current = text;
    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: text, mode, createdAt: new Date().toISOString() };
    updateActiveSession((session) => ({ ...session, title: session.title === 'New assessment chat' ? makeTitle(text) : session.title, messages: [...session.messages, userMessage], updatedAt: new Date().toISOString() }));
    if (!forcedText) setPrompt('');
    setLoading(true);
    abortRef.current = new AbortController();
    const assistantId = `msg-${Date.now()}`;
    streamingMessageIdRef.current = assistantId;
    streamingTextRef.current = '';
    const assistantMessage: ChatMessage = { id: assistantId, role: 'assistant', content: '__STREAMING__', mode, model: PRIMARY_MODEL, createdAt: new Date().toISOString() };
    updateActiveSession((session) => ({ ...session, messages: [...session.messages, assistantMessage], updatedAt: new Date().toISOString() }));
    try {
      await api.localAiChatStream({ prompt: text, mode, model: PRIMARY_MODEL, conversation_id: activeSession.id }, token, abortRef.current.signal, (chunk) => {
        if (chunk.type === 'token' && chunk.token) {
          streamingTextRef.current += chunk.token;
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error || 'Streaming failed');
        }
      });
      const parsed = parseAssistantResponse(streamingTextRef.current);
      updateActiveSession((session) => {
        const messages = session.messages.map((message) => message.id === assistantId ? { ...message, content: parsed.content, raw: streamingTextRef.current, parserWarning: parsed.warning } : message);
        return { ...session, messages, updatedAt: new Date().toISOString() };
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      updateActiveSession((session) => {
        const messages = session.messages.map((message) => message.id === assistantId ? { ...message, content: { type: 'error', message: buildErrorMessage(error).content.message ?? 'Unable to display response. Try again.' } } : message);
        return { ...session, messages, updatedAt: new Date().toISOString() };
      });
    } finally {
      setLoading(false); abortRef.current = null; streamingMessageIdRef.current = null; streamingTextRef.current = '';
    }
  }

  function updateActiveSession(updater: (session: ChatSession) => ChatSession) { setSessions((current) => sortSessions(current.map((session) => session.id === activeId ? updater(session) : session))); }
  function changeMode(nextMode: string) { setMode(nextMode); updateActiveSession((session) => ({ ...session, mode: nextMode, updatedAt: new Date().toISOString() })); }
  function startNewChat() { const session = createChatSession(); setSessions((current) => [session, ...current]); setActiveId(session.id); setMode(session.mode); setPrompt(''); }
  function stopGeneration() { abortRef.current?.abort(); setLoading(false); }
  function deleteSession(id: string) { if (!window.confirm('Delete this conversation? This cannot be undone.')) return; const remaining = sessions.filter((item) => item.id !== id); const next = remaining.length ? remaining : [createChatSession()]; setSessions(next); if (id === activeId) setActiveId(next[0].id); }
  function renameSession(id: string) { const name = window.prompt('Rename conversation'); if (!name?.trim()) return; setSessions((current) => current.map((item) => item.id === id ? { ...item, title: name.trim(), updatedAt: new Date().toISOString() } : item)); }
  function patchSession(id: string, patch: Partial<ChatSession>) { setSessions((current) => sortSessions(current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item))); }
  function clearContext() { setPrompt((current) => current ? `${current}\n\nContext cleared.` : 'Context cleared.'); }
  function retryLastMessage() { if (lastUserPromptRef.current) sendMessage(undefined, lastUserPromptRef.current); }

  return (
    <main className="min-h-[calc(100vh-88px)] bg-[var(--bg)] text-[var(--text)]">
      {(showHistory) ? <button aria-label="Close assistant drawer" className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => { setShowHistory(false); }} /> : null}
      <div className="flex h-[calc(100dvh-88px)] overflow-hidden rounded-none sm:rounded-3xl">
        <ConversationSidebar sessions={sessions} activeId={activeId} search={search} setSearch={setSearch} setActiveId={setActiveId} startNewChat={startNewChat} renameSession={renameSession} deleteSession={deleteSession} patchSession={patchSession} mobileOpen={showHistory} onClose={() => setShowHistory(false)} />
        <section className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
          <ConversationHeader mode={activeMode.label} onOpenHistory={() => setShowHistory(true)} onNewChat={startNewChat} onOpenToolRequest={() => setToolRequestOpen(true)} health={health} />
          <AgentModeSelector mode={mode} setMode={changeMode} />
          <ChatMessageList messages={activeSession.messages} loading={loading} mode={activeMode.label} onUsePrompt={setPrompt} onRetry={retryLastMessage} />
          <ChatComposer value={prompt} setValue={setPrompt} onSubmit={sendMessage} onStop={stopGeneration} loading={loading} disabled={!authorizationAvailable} authLoading={authLoading} />
        </section>
        <ContextPanelRail open={showContext} onToggle={() => setShowContext((v) => !v)} health={health} />
      </div>
      <AgentToolRequestPanel open={toolRequestOpen} onClose={() => setToolRequestOpen(false)} />
    </main>
  );
}

function ConversationSidebar(props: { sessions: ChatSession[]; activeId: string; search: string; setSearch: (v: string) => void; setActiveId: (id: string) => void; startNewChat: () => void; renameSession: (id: string) => void; deleteSession: (id: string) => void; patchSession: (id: string, patch: Partial<ChatSession>) => void; mobileOpen: boolean; onClose: () => void }) {
  const filtered = props.sessions.filter((item) => !item.archived && item.title.toLowerCase().includes(props.search.toLowerCase()));
  const groups = groupSessions(filtered);
  const groupEntries = Object.entries(groups).filter(([, rows]) => rows.length);
  return (
    <aside className={`${props.mobileOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'} w-[86vw] max-w-[280px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-xl lg:static lg:flex lg:w-[260px] lg:shadow-none`}>
      <div className="flex items-center justify-between px-3 py-3 pb-2">
        <h2 className="text-[13px] font-bold text-[var(--text)]">Conversations</h2>
        <div className="flex items-center gap-1.5">
          <button className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-2)] lg:hidden" onClick={props.onClose}><XCircle className="h-4 w-4" /></button>
          <button onClick={props.startNewChat} className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]" title="New Chat"><MessageSquarePlus className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="mx-3 mb-2.5">
        <label className="flex h-[32px] items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-2.5 transition focus-within:border-[var(--accent)]/50 focus-within:shadow-[0_0_0_2px_var(--accent-soft)]">
          <Search className="h-[13px] w-[13px] text-[var(--light)]" />
          <input value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="Search conversations" className="w-full bg-transparent text-[12px] text-[var(--text)] placeholder:text-[var(--light)] outline-none" />
        </label>
      </div>
      {!props.sessions.length ? <SkeletonList /> : null}
      {filtered.length ? (
        <div className="flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:rounded-[4px] [&::-webkit-scrollbar-thumb]:bg-[var(--border)] [&::-webkit-scrollbar-track]:bg-transparent">
          {groupEntries.map(([group, rows], index) => (
            <div key={group}>
              {index > 0 ? <div className="mx-3.5 my-2 h-px bg-[var(--border)]" /> : null}
              <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--light)]">{group}</p>
              <div className="space-y-[2px]">
                {rows.map((session) => (
                  <ConversationListItem key={session.id} session={session} active={session.id === props.activeId} onSelect={() => { props.setActiveId(session.id); props.onClose(); }} onRename={() => props.renameSession(session.id)} onDelete={() => props.deleteSession(session.id)} onPin={() => props.patchSession(session.id, { pinned: !session.pinned })} onArchive={() => props.patchSession(session.id, { archived: true })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] p-3 text-xs text-[var(--muted)]">No conversations found.</div>
      )}
    </aside>
  );
}

function ConversationListItem({ session, active, onSelect, onRename, onDelete, onPin, onArchive }: { session: ChatSession; active: boolean; onSelect: () => void; onRename: () => void; onDelete: () => void; onPin: () => void; onArchive: () => void }) {
  return (
    <div className={`group rounded-[10px] px-3 py-2 ${active ? 'border border-[var(--accent)]/30 bg-[var(--accent-soft)]' : 'border border-transparent hover:bg-[var(--surface-2)]'}`}>
      <button onClick={onSelect} className="w-full text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-[var(--text)]">{session.title}</span>
          {session.pinned ? <Pin className="h-3 w-3 text-[var(--accent)]" /> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-[5px] text-[11px] text-[var(--muted)]">
          <span className="rounded-md bg-[var(--surface-2)] px-[5px] py-px text-[10px] font-medium text-[var(--muted)]">{labelForMode(session.mode)}</span>
          <span>{formatTime(session.updatedAt)}</span>
        </div>
      </button>
      <div className="mt-1.5 hidden gap-1 group-hover:flex">
        <SmallAction label="Rename" icon={MoreHorizontal} onClick={onRename} />
        <SmallAction label="Pin" icon={Pin} onClick={onPin} />
        <SmallAction label="Archive" icon={Archive} onClick={onArchive} />
        <SmallAction label="Delete" icon={Trash2} onClick={onDelete} danger />
      </div>
    </div>
  );
}

function ConversationHeader({ mode, onOpenHistory, onNewChat, onOpenToolRequest, health }: { mode: string; onOpenHistory: () => void; onNewChat: () => void; onOpenToolRequest: () => void; health: Health | null }) {
  return (
    <header className="bg-[var(--bg)] px-4 py-3 lg:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button className="lg:hidden text-[var(--text)]" onClick={onOpenHistory}><Menu className="h-5 w-5" /></button>
          <h1 className="text-[16px] font-bold text-[var(--text)]">NoovaStack Security Assistant</h1>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${health?.available ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--warn)]/15 text-[var(--warn)]'}`}>{health?.available ? 'Connected' : 'Checking'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <HeaderButton onClick={onOpenToolRequest} label="Request Tool" icon={Wrench} />
          <HeaderButton onClick={onNewChat} label="New Chat" />
          <HeaderButton onClick={() => undefined} label="Select Context" />
          <HeaderButton onClick={() => undefined} label="View Details" />
        </div>
      </div>
    </header>
  );
}

function AgentModeSelector({ mode, setMode }: { mode: string; setMode: (mode: string) => void }) {
  return (
    <div className="bg-[var(--bg)] px-4 pb-3 lg:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {modes.map((item) => (
            <button key={item.id} title={item.tip} onClick={() => setMode(item.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${mode === item.id ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]'}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatMessageList({ messages, loading, mode, onUsePrompt, onRetry }: { messages: ChatMessage[]; loading: boolean; mode: string; onUsePrompt: (value: string) => void; onRetry: () => void }) {
  const nearEmpty = messages.length <= 1;
  const groups = useMemo(() => groupMessages(messages), [messages]);
  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)] p-[18px]">
      <div className="mx-auto max-w-[900px] space-y-[14px]">
        {nearEmpty ? <AssistantEmptyState onUsePrompt={onUsePrompt} /> : groups.map((group, groupIndex) => {
          if (group.role === 'user') {
            return <UserMessageGroup key={group.id} messages={group.messages} />;
          }
          if (group.role === 'error') {
            return group.messages.map((message) => <ErrorMessage key={message.id} message={message} />);
          }
          return group.messages.map((message) => <AssistantMessage key={message.id} message={message} onUsePrompt={onUsePrompt} onRetry={onRetry} />);
        })}
        {loading ? <StreamingIndicator mode={mode} /> : null}
      </div>
    </div>
  );
}

function AssistantEmptyState({ onUsePrompt }: { onUsePrompt: (value: string) => void }) {
  const prompts = ['Create a safe assessment plan', 'Review a finding', 'Suggest remediation', 'Write a report summary', 'Explain required evidence'];
  const visible = prompts.slice(0, 3);
  const more = prompts.length - visible.length;
  return (
    <section className="py-12 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-2)] text-[var(--accent)] shadow-[var(--shadow)]">
          <Bot className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--text)]">NoovaStack Security Assistant</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Plan authorized assessments, review findings, and draft report content with local AI.</p>
      </div>
      <div className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-2">
        {visible.map((prompt) => <button key={prompt} onClick={() => onUsePrompt(prompt)} className="inline-flex items-center gap-2 rounded-[20px] border border-[var(--border)] bg-[var(--surface-2)] px-[11px] py-[5px] text-[12px] font-medium text-[var(--text)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"><Sparkles className="h-[13px] w-[13px]" />{prompt}</button>)}
        {more > 0 ? <button className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-2)] px-[11px] py-[5px] text-[12px] font-medium text-[var(--muted)]">+ {more} more</button> : null}
      </div>
    </section>
  );
}

function UserMessageGroup({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[78%] flex-col items-end gap-[4px]">
        {messages.map((message, index) => (
          <div key={message.id} className={`rounded-[14px] bg-[var(--accent)] px-[13px] py-[9px] text-[13px] leading-[1.55] text-white shadow-[var(--shadow)] ${index === messages.length - 1 ? 'rounded-br-[4px]' : ''} ${index === 0 ? 'rounded-tr-[14px]' : ''}`}>
            <div className="whitespace-pre-wrap break-words">{typeof message.content === 'string' ? message.content : '[User input]'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantMessage({ message, onUsePrompt, onRetry }: { message: ChatMessage; onUsePrompt: (value: string) => void; onRetry: () => void }) {
  const content = typeof message.content === 'string' ? safeParseStringContent(message.content) : message.content;
  const [showRaw, setShowRaw] = useState(false);

  if (content.type === 'streaming') {
    return (
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-[var(--accent)] shadow-[var(--shadow)]">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:240ms]" />
          </div>
          <p className="text-[11px] text-[var(--muted)]">Generating response...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--muted)]">
        <span className="h-[5px] w-[5px] rounded-full bg-[var(--success)]" />
        <span className="font-medium text-[var(--text)]">NoovaStack Assistant</span>
        <span className="rounded-[10px] bg-[var(--surface-2)] px-[6px] py-[1px] text-[10px] font-semibold text-[var(--muted)]">{labelForMode(message.mode ?? 'general')}</span>
        <span>·</span>
        <span>{formatTime(message.createdAt)}</span>
      </div>
      <div className="max-w-[78%] rounded-[14px] rounded-bl-[4px] border border-[var(--border)] bg-[var(--surface)] px-[14px] py-[10px] text-[13px] leading-[1.55] text-[var(--text)] shadow-[var(--shadow)]">
        {renderAssistantContent(content, () => setShowRaw((v) => !v), onRetry)}
        {message.parserWarning ? <p className="mt-2 text-xs text-[var(--warn)]">{message.parserWarning}</p> : null}
      </div>
      {showRaw ? <pre className="mt-1 max-h-48 max-w-[78%] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[10px] text-[var(--muted)]">{JSON.stringify(message.raw ?? content, null, 2)}</pre> : null}
      <SuggestionChips mode={message.mode ?? 'general'} onUse={onUsePrompt} />
    </div>
  );
}

function safeParseStringContent(text: string): AssistantContent {
  if (!text || text === '__STREAMING__') return { type: 'streaming' } as AssistantContent;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      const result = assistantContentSchema.safeParse(parsed);
      if (result.success) return result.data;
      return { type: 'plain', message: parsed.message ?? parsed.summary ?? JSON.stringify(parsed) };
    }
    return { type: 'plain', message: text };
  } catch {
    return { type: 'plain', message: text };
  }
}

function renderAssistantContent(content: AssistantContent, toggleRaw: () => void, onRetry: () => void) {
  if (content.type === 'error') {
    return <ErrorMessageCard content={content} onRetry={onRetry} />;
  }
  if (content.type === 'structured' || content.type === 'card') {
    return <GenericStructuredCard content={content} onToggleRaw={toggleRaw} />;
  }
  return (
    <div className="space-y-2">
      <PlainTextMessage content={content} />
      {content.type === 'finding_review' ? <FindingReviewCard content={content} onToggleRaw={toggleRaw} /> : null}
      {content.type === 'remediation' ? <RemediationCard content={content} onToggleRaw={toggleRaw} /> : null}
      {content.type === 'report_draft' ? <ReportDraftCard content={content} onToggleRaw={toggleRaw} /> : null}
      {content.tool_calls?.length ? <ToolActivityCard tools={content.tool_calls} onToggleRaw={toggleRaw} /> : null}
      {(content.evidence?.length || content.evidence_ids?.length) ? <EvidenceReferenceCard content={content} onToggleRaw={toggleRaw} /> : null}
    </div>
  );
}

function PlainTextMessage({ content }: { content: AssistantContent }) {
  const status = content.status;
  const statusType = status === 'Rejected' || status === 'rejected' ? 'rejected' : status === 'Accepted' || status === 'accepted' || status === 'Verified' || status === 'verified' ? 'success' : content.warnings?.length ? 'warning' : undefined;
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-[var(--text)]">{content.message ?? content.summary ?? ''}</p>
      {statusType ? <CompactStatusCard status={statusType} message={content.message ?? content.summary ?? ''} warnings={content.warnings} /> : null}
    </div>
  );
}

function CompactStatusCard({ status, message, warnings }: { status: 'rejected' | 'success' | 'warning'; message: string; warnings?: string[] }) {
  const config = {
    rejected: { icon: XCircle, title: 'Request Rejected', badge: 'Rejected', badgeClass: 'bg-[var(--danger)]/15 text-[var(--danger)]', iconClass: 'text-[var(--danger)]' },
    success: { icon: CheckCircle2, title: 'Request Accepted', badge: 'Success', badgeClass: 'bg-[var(--success)]/15 text-[var(--success)]', iconClass: 'text-[var(--success)]' },
    warning: { icon: AlertTriangle, title: 'Warning', badge: 'Warning', badgeClass: 'bg-[var(--warn)]/15 text-[var(--warn)]', iconClass: 'text-[var(--warn)]' },
  }[status];
  const Icon = config.icon;
  const warningText = warnings?.length ? 'Unauthorized changes may compromise security. Modifications require proper authorization.' : undefined;
  return (
    <div className="mt-2 overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Icon className={`h-4 w-4 ${config.iconClass}`} />
        <span className="text-[12px] font-semibold text-[var(--text)]">{config.title}</span>
        <span className={`ml-auto rounded-[10px] px-2 py-0.5 text-[11px] font-bold ${config.badgeClass}`}>{config.badge}</span>
      </div>
      <div className="space-y-2 px-3 py-2 text-[13px] leading-[1.5] text-[var(--text)]">
        <p>{message}</p>
        {warningText ? (
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--warn)]">
            <AlertTriangle className="h-[14px] w-[14px] flex-shrink-0" />
            <span>{warningText}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FindingReviewCard({ content, onToggleRaw }: { content: AssistantContent; onToggleRaw: () => void }) {
  return (
    <CompactStructuredCard title="Finding Review" icon={CheckCircle2} status={content.recommendation === 'Rejected' ? 'rejected' : content.recommendation === 'Verified' || content.recommendation === 'Accepted' ? 'success' : 'warning'} onToggleRaw={onToggleRaw}>
      <InfoGrid rows={[['Recommendation', content.recommendation], ['Suggested severity', content.suggested_severity ?? content.severity], ['OWASP category', content.owasp_category], ['CWE', content.cwe], ['Human review required', content.human_review_required === false ? 'No' : 'Yes']]} />
      <List title="Evidence used" items={content.evidence_ids} />
      <List title="Missing information" items={content.missing_information} />
      <CardActions actions={['Accept', 'Edit', 'Reject', 'More Evidence']} />
    </CompactStructuredCard>
  );
}

function RemediationCard({ content, onToggleRaw }: { content: AssistantContent; onToggleRaw: () => void }) {
  const r = content.remediation;
  return (
    <CompactStructuredCard title="Remediation Draft" icon={ShieldCheck} status="success" onToggleRaw={onToggleRaw}>
      <p className="text-[13px]">{r?.issue_summary}</p>
      <List title="Immediate Mitigation" items={r?.immediate_mitigation} />
      <List title="Long-Term Remediation" items={r?.long_term_remediation} />
      <List title="Verification Steps" items={r?.verification_steps} />
      <List title="References" items={r?.references} />
    </CompactStructuredCard>
  );
}

function ReportDraftCard({ content, onToggleRaw }: { content: AssistantContent; onToggleRaw: () => void }) {
  return (
    <CompactStructuredCard title="Report Content Draft" icon={FileText} status="success" onToggleRaw={onToggleRaw}>
      <InfoBlock label="Current Content" value={content.report?.current_content} />
      <InfoBlock label="AI Suggestion" value={content.report?.ai_suggestion} />
      <CardActions actions={['Accept', 'Edit', 'Reject', 'Regenerate']} />
    </CompactStructuredCard>
  );
}

function ToolActivityCard({ tools, onToggleRaw }: { tools: z.infer<typeof toolCallSchema>[]; onToggleRaw: () => void }) {
  return (
    <CompactStructuredCard title="Safe Tool Activity" icon={Clock} status="success" onToggleRaw={onToggleRaw}>
      {tools.map((tool, i) => (
        <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-xs">
          <div className="flex justify-between gap-3">
            <strong className="text-[var(--text)]">{tool.name ?? 'Approved platform function'}</strong>
            <StatusText status={tool.status ?? 'Queued'} />
          </div>
          <p className="mt-1 text-[var(--muted)]">Duration: {tool.duration ?? 'pending'} · Output: {tool.output_reference ?? 'not available'}</p>
          <pre className="mt-1 overflow-auto rounded bg-[var(--bg)] p-1.5 text-[10px] text-[var(--muted)]">{JSON.stringify(sanitizeParams(tool.parameters ?? {}), null, 2)}</pre>
        </div>
      ))}
    </CompactStructuredCard>
  );
}

function EvidenceReferenceCard({ content, onToggleRaw }: { content: AssistantContent; onToggleRaw: () => void }) {
  const evidence: EvidenceItem[] = content.evidence?.length ? content.evidence : content.evidence_ids?.map((id) => ({ id, type: 'Evidence reference', source: 'Selected context', captured: 'Captured time unavailable', redaction_status: 'Redacted', integrity_status: 'Integrity verified' })) ?? [];
  return (
    <CompactStructuredCard title="Evidence References" icon={FileText} status="success" onToggleRaw={onToggleRaw}>
      {evidence.map((item) => (
        <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-xs">
          <strong className="text-[var(--text)]">{item.id}</strong>
          <p className="text-[var(--muted)]">{item.type} · {item.source} · {item.captured ?? 'Captured time unavailable'}</p>
          <p className="text-[var(--muted)]">{item.redaction_status ?? 'Redacted'} · {item.integrity_status ?? 'Integrity verified'}</p>
          <div className="mt-1 flex gap-2">
            <MiniButton label="Preview" />
            <MiniButton label="Copy" onClick={() => navigator.clipboard?.writeText(item.id ?? '')} />
          </div>
        </div>
      ))}
    </CompactStructuredCard>
  );
}

function CompactStructuredCard({ title, icon: Icon, status, onToggleRaw, children }: { title: string; icon: typeof Bot; status: 'rejected' | 'success' | 'warning'; onToggleRaw: () => void; children: React.ReactNode }) {
  const badge = { rejected: 'bg-[var(--danger)]/15 text-[var(--danger)]', success: 'bg-[var(--success)]/15 text-[var(--success)]', warning: 'bg-[var(--warn)]/15 text-[var(--warn)]' }[status];
  const label = { rejected: 'Rejected', success: 'Success', warning: 'Warning' }[status];
  return (
    <div className="mt-2 overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Icon className={`h-4 w-4 ${status === 'rejected' ? 'text-[var(--danger)]' : status === 'success' ? 'text-[var(--success)]' : 'text-[var(--warn)]'}`} />
        <span className="text-[12px] font-semibold text-[var(--text)]">{title}</span>
        <span className={`ml-auto rounded-[10px] px-2 py-0.5 text-[11px] font-bold ${badge}`}>{label}</span>
        <button type="button" onClick={onToggleRaw} className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface)]" title="View raw data"><MoreHorizontal className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-2 px-3 py-2 text-[13px] leading-[1.5] text-[var(--text)]">{children}</div>
    </div>
  );
}

function SuggestionChips({ mode, onUse }: { mode: string; onUse: (v: string) => void }) {
  const chips = MODE_SUGGESTIONS[mode] ?? MODE_SUGGESTIONS.general;
  const visible = chips.slice(0, 3);
  const more = chips.length - visible.length;
  return (
    <div className="ml-1 mt-1.5 flex flex-wrap gap-1.5">
      {visible.map((chip) => {
        const Icon = chip.icon;
        return (
          <button key={chip.label} onClick={() => onUse(chip.prompt)} className="inline-flex items-center gap-1.5 rounded-[20px] border border-[var(--border)] bg-[var(--surface-2)] px-[11px] py-[5px] text-[12px] text-[var(--text)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]">
            <Icon className="h-[13px] w-[13px]" />
            {chip.label}
          </button>
        );
      })}
      {more > 0 ? <button className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-2)] px-[11px] py-[5px] text-[12px] text-[var(--muted)]">+ {more} more</button> : null}
    </div>
  );
}

function ContextPanelRail({ open, onToggle, health }: { open: boolean; onToggle: () => void; health: Health | null }) {
  const [hovered, setHovered] = useState(false);
  const expanded = open || hovered;
  const items = [
    { label: 'Project', value: 'No project context selected', status: 'empty' as const },
    { label: 'Engagement', value: 'Not selected', status: 'empty' as const },
    { label: 'Scan', value: 'Not selected', status: 'empty' as const },
    { label: 'Finding', value: 'Not selected', status: 'empty' as const },
    { label: 'Authorization', value: 'Authorization needed before testing', status: 'blocked' as const },
    { label: 'Scope', value: 'Scope protection is active', status: 'ok' as const },
    { label: 'Testing window', value: 'Testing window must be confirmed', status: 'empty' as const },
    { label: 'Model', value: health?.model ?? PRIMARY_MODEL, status: health?.available ? 'ok' as const : 'blocked' as const },
    { label: 'Health', value: health?.available ? 'Connected' : 'Unavailable', status: health?.available ? 'ok' as const : 'blocked' as const },
  ];

  return (
    <aside
      className={`relative hidden shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] transition-all duration-200 lg:flex ${expanded ? 'w-[200px]' : 'w-[52px]'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)]"
        title={expanded ? 'Collapse panel' : 'Expand panel'}
      >
        {expanded ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
      <div className="flex flex-1 flex-col items-center py-3">
        {items.map((item) => (
          <div key={item.label} className="group relative flex w-full items-center gap-2 px-2 py-2">
            <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${item.status === 'ok' ? 'bg-[var(--success)]' : item.status === 'blocked' ? 'bg-[var(--danger)]' : 'bg-[var(--warn)]'}`} />
            {expanded ? <span className="truncate text-[11px] text-[var(--muted)]">{item.label}</span> : null}
            {!expanded ? (
              <div className="absolute right-full top-1/2 mr-2 hidden -translate-y-1/2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[11px] text-[var(--text)] group-hover:block whitespace-nowrap z-50">
                {item.label}: {item.value}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {expanded ? (
        <div className="border-t border-[var(--border)] p-3">
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.label} className="text-[11px]">
                <p className="text-[var(--light)]">{item.label}</p>
                <p className="truncate text-[var(--text)]">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function ChatComposer({ value, setValue, onSubmit, onStop, loading, disabled, authLoading }: { value: string; setValue: (v: string) => void; onSubmit: () => void; onStop: () => void; loading: boolean; disabled: boolean; authLoading: boolean }) {
  function keyDown(e: KeyboardEvent<HTMLTextAreaElement>) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="bg-[var(--bg)] p-[18px]">
      <div className="mx-auto max-w-[900px] overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex items-center gap-1 border-b border-[var(--border)] px-2.5 py-1.5">
          <ComposerToolbarButton label="Attach" icon={Paperclip} onClick={() => undefined} />
          <ComposerToolbarButton label="Reference" icon={FileText} onClick={() => undefined} />
          <ComposerToolbarButton label="Clear" icon={Trash2} onClick={() => setValue('')} danger />
        </div>
        <div className="flex items-end gap-2 px-2.5 pb-2 pt-2">
          <textarea value={value} maxLength={MAX_INPUT} onKeyDown={keyDown} onChange={(e) => setValue(e.target.value)} disabled={disabled} rows={1} placeholder={authLoading ? 'Loading session...' : 'Ask the local AI...'} className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[13px] leading-5 text-[var(--text)] caret-[var(--accent)] outline-none placeholder:text-[var(--light)] disabled:cursor-not-allowed" onDrop={(e) => e.preventDefault()} onPaste={() => undefined} />
          {loading ? (
            <button type="button" onClick={onStop} className="grid h-8 w-8 place-items-center rounded-[10px] border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"><PauseCircle className="h-4 w-4" /></button>
          ) : (
            <button type="submit" disabled={disabled || !value.trim()} className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--accent)] text-white disabled:opacity-50"><Send className="h-4 w-4" /></button>
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--light)]">
          <span>{value.length.toLocaleString()} / {MAX_INPUT.toLocaleString()} · Shift+Enter newline</span>
        </div>
      </div>
    </form>
  );
}

function ComposerToolbarButton({ label, icon: Icon, onClick, danger }: { label: string; icon: typeof Paperclip; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition hover:bg-[var(--surface-2)] ${danger ? 'ml-auto text-[var(--danger)] hover:bg-[var(--danger-bg)]' : 'text-[var(--muted)]'}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function parseAssistantResponse(value: unknown): { content: AssistantContent; warning?: string } {
  if (typeof value === 'string') {
    const rawText = value;
    try { value = JSON.parse(rawText); } catch {
      return { content: { type: 'plain', message: rawText, warnings: ['Malformed JSON. Displayed as plain text.'], human_review_required: true }, warning: 'Malformed JSON. Displayed as plain text.' };
    }
  }
  const parsed = assistantContentSchema.safeParse(value);
  if (!parsed.success) return { content: { type: 'plain', message: typeof value === 'object' ? JSON.stringify(value) : String(value), warnings: ['Unexpected response shape. Displayed safely as text.'], human_review_required: true }, warning: 'Unexpected response shape.' };
  return { content: parsed.data };
}

function normalizeChatResponse(response: unknown) {
  const row = response && typeof response === 'object' ? response as Record<string, unknown> : {};
  const model = row.model && typeof row.model === 'object' ? row.model as Record<string, unknown> : null;
  return {
    messageId: String(row.message_id ?? `msg-${Date.now()}`),
    mode: String(row.mode ?? 'general'),
    content: row.content ?? row.text ?? { type: 'plain', message: 'The local model returned an empty response.', human_review_required: true },
    model: String(model?.name ?? row.model ?? PRIMARY_MODEL),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    raw: row.raw ?? response,
  };
}

function buildAuthErrorMessage(): ChatMessage { return { id: `auth-${Date.now()}`, role: 'error', content: { type: 'error', message: 'Your secure session is not ready. Refresh the page or sign in again before sending a local AI request.', human_review_required: true }, createdAt: new Date().toISOString() }; }
function buildErrorMessage(error: unknown): ChatMessage {
  let message = `The local ${PRIMARY_MODEL} model is currently unavailable. Check the Ollama service and model health, then retry.`;
  if (error instanceof ApiError) message = error.detail.includes('timeout') ? 'Request timeout while waiting for the local model. Reduce context size or retry.' : error.detail;
  return { id: `err-${Date.now()}`, role: 'error', content: { type: 'error', message, human_review_required: true }, createdAt: new Date().toISOString() };
}

function ErrorMessageCard({ content, onRetry }: { content: AssistantContent; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 text-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-[var(--danger)] flex-shrink-0" />
        <strong className="text-[var(--danger)]">Unable to display response</strong>
      </div>
      <p className="mt-1.5 text-[var(--text)]">{content.message ?? 'The model returned a response that could not be parsed.'}</p>
      <button onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]">
        <RefreshCw className="h-3.5 w-3.5" />Retry
      </button>
    </div>
  );
}

function GenericStructuredCard({ content, onToggleRaw }: { content: AssistantContent; onToggleRaw: () => void }) {
  const title = (content as Record<string, unknown>).title ?? (content as Record<string, unknown>).name ?? 'Response';
  const message = content.message ?? content.summary ?? String((content as Record<string, unknown>).body ?? '');
  const fields = Object.entries(content as Record<string, unknown>).filter(([k]) => !['type', 'message', 'summary', 'title', 'name', 'body', 'warnings', 'human_review_required'].includes(k));
  return (
    <CompactStructuredCard title={String(title)} icon={Info} status="success" onToggleRaw={onToggleRaw}>
      <p className="text-[13px] leading-[1.5]">{String(message)}</p>
      {fields.length > 0 ? <InfoGrid rows={fields.map(([k, v]) => [k, String(v ?? '')])} /> : null}
    </CompactStructuredCard>
  );
}

function ErrorMessage({ message }: { message: ChatMessage }) {
  const content = message.content as AssistantContent;
  return (
    <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger)]">
      <strong>Chat error</strong>
      <p className="mt-1">{content.message}</p>
      <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--surface)] px-3 py-1 text-xs font-semibold">
        <RefreshCw className="h-3 w-3" />Retry last message
      </button>
    </div>
  );
}

function StreamingIndicator({ mode }: { mode: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-[var(--accent)] shadow-[var(--shadow)]">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:240ms]" />
        </div>
        <p className="text-[11px] text-[var(--muted)]">Thinking...<span className="text-[var(--light)]"> · {mode}</span></p>
      </div>
    </div>
  );
}

function InfoGrid({ rows }: { rows: Array<[string, string | undefined]> }) {
  return <div className="grid gap-2 sm:grid-cols-2">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="rounded-lg bg-[var(--bg)] p-2 text-xs"><p className="text-[10px] text-[var(--muted)]">{k}</p><p className="font-medium text-[var(--text)]">{v}</p></div>)}</div>;
}

function List({ title, items }: { title: string; items?: string[] }) {
  return items?.length ? <div><p className="text-xs font-semibold text-[var(--muted)]">{title}</p><ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[var(--muted)]">{items.map((item) => <li key={item}>{item}</li>)}</ul></div> : null;
}

function CardActions({ actions }: { actions: string[] }) {
  return <div className="flex flex-wrap gap-2">{actions.map((action) => <MiniButton key={action} label={action} />)}</div>;
}

function InfoBlock({ label, value }: { label: string; value?: string }) {
  return value ? <div className="rounded-lg bg-[var(--bg)] p-2 text-xs"><p className="mb-0.5 text-[10px] font-semibold text-[var(--muted)]">{label}</p><p className="whitespace-pre-wrap text-[var(--text)]">{value}</p></div> : null;
}

function HeaderButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon?: typeof Wrench }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
      {Icon ? <Icon className="h-4 w-4" /> : null}{label}
    </button>
  );
}

function MiniButton({ label, onClick, icon: Icon }: { label: string; onClick?: () => void; icon?: typeof Bot }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]">
      {Icon ? <Icon className="h-3 w-3" /> : null}{label}
    </button>
  );
}

function SmallAction({ label, icon: Icon, onClick, danger }: { label: string; icon: typeof Bot; onClick: () => void; danger?: boolean }) {
  return <button type="button" title={label} onClick={onClick} className={`rounded-md p-1 ${danger ? 'text-[var(--danger)]' : 'text-[var(--muted)]'} hover:bg-[var(--surface)]`}><Icon className="h-3.5 w-3.5" /></button>;
}

function SkeletonList() {
  return <div className="space-y-2 px-3">{[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--surface-2)]" />)}</div>;
}

function StatusText({ status }: { status: string }) {
  const color = status === 'Healthy' || status === 'Completed' || status === 'Connected' ? 'text-[var(--success)]' : status === 'Blocked' || status === 'Failed' || status === 'Unavailable' ? 'text-[var(--danger)]' : 'text-[var(--warn)]';
  return <span className={`text-xs font-semibold ${color}`}>{status}</span>;
}

function createChatSession(): ChatSession { return { id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: 'New assessment chat', mode: 'general', messages: [welcomeMessage], updatedAt: new Date().toISOString() }; }
function getUserHistoryKey(user: User | null) { return `${HISTORY_KEY_PREFIX}.${user?.id ?? user?.email ?? 'anonymous'}`; }
function displayName(user: User | null) { return user?.full_name || user?.username || user?.email || 'Signed-in user'; }
function loadChatHistory(key: string): ChatSession[] { if (typeof window === 'undefined') return []; try { const raw = sessionStorage.getItem(key) || localStorage.getItem(key); const rows = raw ? JSON.parse(raw) as ChatSession[] : []; return sortSessions(Array.isArray(rows) ? rows.filter((row) => row.id && row.messages?.length) : []); } catch { return []; } }
function saveChatHistory(key: string, sessions: ChatSession[]) { if (typeof window === 'undefined') return; const value = JSON.stringify(sessions); sessionStorage.setItem(key, value); localStorage.setItem(key, value); }
function useDeviceClass() { const [device, setDevice] = useState('desktop'); useEffect(() => { const update = () => setDevice(window.innerWidth < 640 ? 'phone' : window.innerWidth < 1024 ? 'tablet' : 'desktop'); update(); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []); return device; }
function sortSessions(rows: ChatSession[]) { return [...rows].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()); }
function groupSessions(rows: ChatSession[]) { const result: Record<string, ChatSession[]> = { Today: [], Yesterday: [], Earlier: [] }; const now = new Date(); rows.forEach((row) => { const d = new Date(row.updatedAt); const diff = Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86400000); result[diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : 'Earlier'].push(row); }); return result; }
function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function makeTitle(value: string) { return value.length > 36 ? `${value.slice(0, 36)}...` : value; }
function labelForMode(value: string) { return modes.find((item) => item.id === value)?.label ?? value; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'now' : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
function humanize(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()); }
function sanitizeParams(params: Record<string, unknown>) { const blocked = /password|token|cookie|secret|authorization/i; return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, blocked.test(key) ? '[redacted]' : value])); }

function groupMessages(messages: ChatMessage[]) {
  const groups: { id: string; role: 'user' | 'assistant' | 'error'; messages: ChatMessage[] }[] = [];
  messages.forEach((message) => {
    const last = groups[groups.length - 1];
    if (last && last.role === message.role && message.role === 'user') {
      last.messages.push(message);
    } else {
      groups.push({ id: `group-${message.id}`, role: message.role, messages: [message] });
    }
  });
  return groups;
}
