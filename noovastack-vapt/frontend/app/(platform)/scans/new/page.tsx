'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, ChevronRight, Clock, Container, Eye, FileCode2, Globe2, KeyRound, LucideIcon, Network, Radar, Rocket, Search, ShieldAlert, ShieldCheck, UserCheck, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { AuthenticationProfileSelector, ScanSummaryPanel, SelectedModulesPanel, TargetSelection } from '@/components/scans/scan-management';
import { useAssets } from '@/hooks/use-assets';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { useCreateScan } from '@/hooks/use-scans';
import { useCreateSchedule } from '@/hooks/use-schedules';
import { api } from '@/lib/api-client';
import { titleCase } from '@/lib/utils';
import type { ScanValidationResult } from '@/types';

const steps = ['Template', 'Configure', 'Review'];

const scanTemplates = [
  { id: 'vulnerability_scan', group: 'General', title: 'Vulnerability Scan', subtitle: 'Recommended', depth: 'standard', time: '2-3 hours', icon: ShieldAlert, tone: 'red', description: 'A balanced scan for common vulnerabilities across approved assets.', checks: ['Discovery', 'Safe vulnerability checks', 'Evidence', 'Report draft'] },
  { id: 'website', group: 'Application', title: 'Web Application', subtitle: 'OWASP focused', depth: 'standard', time: '2-3 hours', icon: Globe2, tone: 'blue', description: 'Checks web apps, portals, dashboards, headers, TLS, and common web risks.', checks: ['Crawling', 'Headers', 'TLS', 'OWASP checks'] },
  { id: 'api_security', group: 'Application', title: 'API', subtitle: 'REST and GraphQL', depth: 'standard', time: '1-3 hours', icon: FileCode2, tone: 'violet', description: 'Reviews API endpoints, auth behavior, tokens, rate limits, and input handling.', checks: ['API discovery', 'Auth checks', 'Rate limits', 'Input validation'] },
  { id: 'network', group: 'Infrastructure', title: 'Network', subtitle: 'Ports and services', depth: 'quick', time: '15-60 min', icon: Network, tone: 'cyan', description: 'Finds open ports, services, versions, TLS exposure, and known risks.', checks: ['Host discovery', 'Ports', 'Services', 'CVE mapping'] },
  { id: 'container', group: 'Infrastructure', title: 'Container', subtitle: 'Image and package risks', depth: 'standard', time: '30-90 min', icon: Container, tone: 'emerald', description: 'Checks container image packages, dependency risk, misconfiguration, and CVEs.', checks: ['Packages', 'Dependencies', 'CVEs', 'Misconfigurations'] },
];

const templateGroups = ['All', 'General', 'Application', 'Infrastructure'];

const scanDepths = [
  { id: 'quick', title: 'Basic', time: 'Fast', description: 'Light checks for frequent validation.', icon: Zap },
  { id: 'standard', title: 'Standard', time: 'Recommended', description: 'Balanced coverage and safe default.', icon: ShieldCheck },
  { id: 'deep', title: 'Advanced', time: 'More complete', description: 'Deeper testing, may need review.', icon: KeyRound },
];

const accessModes = [
  { id: 'black_box', title: 'Unauthenticated Scan', badge: 'Easiest', icon: Eye, description: 'Scan like an outside visitor. No login, test account, token, or session is needed.', goodFor: 'Public websites, APIs, IPs, and first-pass vulnerability checks.' },
  { id: 'gray_box', title: 'Authenticated Scan', badge: 'Deeper coverage', icon: UserCheck, description: 'Scan with an approved test account or API token to find issues behind login.', goodFor: 'Dashboards, user portals, admin areas, private APIs, and role-based access checks.' },
];

export default function NewScanPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { token } = useAuth();
  const projects = useProjects();
  const createScan = useCreateScan();
  const createSchedule = useCreateSchedule();
  const [step, setStep] = useState(0);
  const [validation, setValidation] = useState<ScanValidationResult | null>(null);
  const [showModules, setShowModules] = useState(false);
  const [templateQuery, setTemplateQuery] = useState('');
  const [templateGroup, setTemplateGroup] = useState('All');
  const [form, setForm] = useState({
    project_id: search.get('project') ?? '',
    engagement_id: '',
    scan_category: search.get('category') ?? 'vulnerability_scan',
    assessment_mode: 'black_box',
    scan_depth: search.get('depth') ?? 'standard',
    auth_profile: 'None',
    schedule_mode: 'run_now',
    schedule_date: new Date().toISOString().slice(0, 10),
    schedule_time: '23:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    recurrence_rule: 'once',
    auto_report: true,
    name: 'Standard Vulnerability Scan',
  });
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const assets = useAssets(form.project_id);
  const selectedProject = projects.data?.find((project) => project.id === form.project_id);
  const selectedTemplate = scanTemplates.find((template) => template.id === form.scan_category) ?? scanTemplates[0];
  const filteredTemplates = scanTemplates.filter((template) => {
    const matchesGroup = templateGroup === 'All' || template.group === templateGroup;
    const haystack = `${template.title} ${template.subtitle} ${template.description} ${template.checks.join(' ')}`.toLowerCase();
    return matchesGroup && haystack.includes(templateQuery.toLowerCase());
  });
  const selectableAssets = useMemo(() => (assets.data ?? []).filter((asset) => asset.approval_status === 'approved' && asset.scope_status === 'in_scope'), [assets.data]);
  const scheduleLabel = form.schedule_mode === 'run_now' ? 'Run now' : `${form.schedule_date} ${form.schedule_time} ${form.timezone}`;
  const hasTargets = Boolean(form.project_id && selectedAssetIds.length);

  useEffect(() => {
    const template = scanTemplates.find((item) => item.id === form.scan_category) ?? scanTemplates[0];
    setForm((current) => ({ ...current, name: `${titleCase(current.scan_depth)} ${template.title}` }));
  }, [form.scan_category, form.scan_depth]);

  const validateMutation = useMutation({
    mutationFn: (scanId: string) => api.validateScan(scanId, token),
    onSuccess: setValidation,
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Validation failed'),
  });

  async function createDraft() {
    if (!form.project_id) throw new Error('Choose a project first');
    if (!selectedAssetIds.length) throw new Error('Choose at least one approved in-scope target');
    return createScan.mutateAsync({
      project_id: form.project_id,
      engagement_id: form.engagement_id || undefined,
      name: form.name,
      assessment_mode: form.assessment_mode,
      scan_category: form.scan_category,
      scan_depth: form.scan_depth,
      asset_ids: selectedAssetIds,
      config: { authentication_profile: form.auth_profile, schedule: form.schedule_mode, safe_only: true },
    });
  }

  async function saveDraft() {
    try {
      const scan = await createDraft();
      toast.success('Scan draft saved');
      router.push(`/scans/${scan.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save draft');
    }
  }

  async function validateCurrentScan() {
    try {
      const scan = await createDraft();
      validateMutation.mutate(scan.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to validate scan');
    }
  }

  async function launch() {
    try {
      const scan = await createDraft();
      const check = await api.validateScan(scan.id, token);
      setValidation(check);
      if (!check.valid) {
        toast.error('Fix the review items before running');
        return;
      }
      if (form.schedule_mode === 'schedule_later') {
        await createSchedule.mutateAsync({
          project_id: form.project_id,
          engagement_id: form.engagement_id || undefined,
          name: form.name,
          assessment_mode: form.assessment_mode,
          scan_category: form.scan_category,
          scan_depth: form.scan_depth,
          recurrence_rule: form.recurrence_rule,
          timezone: form.timezone,
          next_run_at: `${form.schedule_date}T${form.schedule_time}:00`,
          testing_window: { start: form.schedule_time, end: '23:59', timezone: form.timezone },
          report_options: { auto_generate: form.auto_report, asset_ids: selectedAssetIds },
          asset_ids: selectedAssetIds,
          config: { safe_only: true, authentication_profile: form.auth_profile },
        });
        toast.success('Scheduled scan created');
        router.push('/schedules');
        return;
      }
      const launched = await api.launchScan(scan.id, token);
      toast.success('Scan started');
      router.push(`/scans/${launched.id}/progress`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to run scan');
    }
  }

  return <>
    <PageHeader title="New Scan" description="Select a scan template, configure approved targets, and launch with safe defaults." breadcrumbs={[{ href: '/scans', label: 'Scans' }, { label: 'New Scan' }]} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <main className="space-y-6">
        <ScanWizardHeader step={step} />
        {step === 0 ? <Card className="overflow-hidden">
          <div className="border-b border-slate-200 bg-[#0B1F3A] px-5 py-5 text-white sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Dynamic Web Interface · Scan Templates</p>
            <h2 className="mt-2 text-2xl font-bold">Choose a scan type</h2>
            <p className="mt-2 max-w-3xl text-sm text-blue-100">Templates keep scanning easy. Pick the closest option and NoovaStack selects the right checks, safety controls, and evidence workflow.</p>
          </div>
          <CardContent className="space-y-5 bg-slate-50">
            <TemplateToolbar query={templateQuery} group={templateGroup} onQueryChange={setTemplateQuery} onGroupChange={setTemplateGroup} resultCount={filteredTemplates.length} />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredTemplates.map((template) => <TemplateCard key={template.id} template={template} active={form.scan_category === template.id} onClick={() => { setForm({ ...form, scan_category: template.id, scan_depth: template.depth }); setValidation(null); }} />)}
                {!filteredTemplates.length ? <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center text-sm text-[#64748B] lg:col-span-2">No templates match your search.</div> : null}
              </div>
              <LiveTemplatePanel template={selectedTemplate} project={selectedProject?.name} approvedTargets={selectableAssets.length} selectedTargets={selectedAssetIds.length} />
            </div>
          </CardContent>
        </Card> : null}

        {step === 1 ? <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Configure</p>
                  <h2 className="mt-1 text-lg font-semibold text-[#0F172A]">{selectedTemplate.title}</h2>
                  <p className="mt-1 text-sm text-[#64748B]">Set the scan name, project, targets, and scan intensity.</p>
                </div>
                <TemplatePill template={selectedTemplate} />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ConfigureStatus project={selectedProject?.name} selectedTargets={selectedAssetIds.length} approvedTargets={selectableAssets.length} depth={form.scan_depth} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
                <Field label="Project"><Select value={form.project_id} onChange={(event) => { setForm({ ...form, project_id: event.target.value }); setSelectedAssetIds([]); setValidation(null); }}><option value="">Select project</option>{(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field>
              </div>
              <div>
                <h3 className="mb-3 font-semibold text-[#0F172A]">Scan intensity</h3>
                <div className="grid gap-3 md:grid-cols-3">{scanDepths.map((depth) => <DepthOption key={depth.id} depth={depth} active={form.scan_depth === depth.id} onClick={() => { setForm({ ...form, scan_depth: depth.id }); setValidation(null); }} />)}</div>
              </div>
              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#0F172A]">Login access</h3>
                    <p className="mt-1 text-sm text-[#64748B]">Choose whether the scanner should test only public pages or also areas behind login.</p>
                  </div>
                  <button type="button" onClick={() => { setForm({ ...form, assessment_mode: 'white_box' }); setValidation(null); }} className="text-sm font-semibold text-[#2563EB]">Need full internal review?</button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">{accessModes.map((mode) => <AccessModeCard key={mode.id} mode={mode} active={form.assessment_mode === mode.id} onClick={() => { setForm({ ...form, assessment_mode: mode.id, auth_profile: mode.id === 'black_box' ? 'None' : form.auth_profile }); setValidation(null); }} />)}</div>
                {form.assessment_mode === 'white_box' ? <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-[#0B1F3A]"><p className="font-semibold">Full internal review selected</p><p className="mt-1 text-[#475569]">Use this when the assessment includes source code, architecture, configuration, or internal context. This may require review before launch.</p></div> : null}
              </div>
              {form.assessment_mode !== 'black_box' ? <div className="rounded-2xl border border-[#E2E8F0] bg-slate-50 p-4"><div className="mb-3"><h3 className="font-semibold text-[#0F172A]">Test login profile</h3><p className="mt-1 text-sm text-[#64748B]">Select a saved credential reference. Secrets are never shown here.</p></div><AuthenticationProfileSelector value={form.auth_profile} onChange={(auth_profile) => { setForm({ ...form, auth_profile }); setValidation(null); }} /></div> : null}
              {form.project_id ? <TargetSelection assets={assets.data ?? []} selectedIds={selectedAssetIds} onChange={(ids) => { setSelectedAssetIds(ids); setValidation(null); }} /> : <EmptyTargets />}
            </CardContent>
          </Card>
        </div> : null}

        {step === 2 ? <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Review</p>
            <h2 className="mt-1 text-lg font-semibold text-[#0F172A]">Ready to launch?</h2>
            <p className="mt-1 text-sm text-[#64748B]">Review scope and run a readiness check before starting.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <ReviewGrid template={selectedTemplate} project={selectedProject?.name} targetCount={selectedAssetIds.length} depth={form.scan_depth} mode={form.assessment_mode} />
            <div className="grid gap-4 md:grid-cols-2">
              <RunOption active={form.schedule_mode === 'run_now'} icon={Rocket} title="Launch now" text="Run immediately after readiness check passes." onClick={() => setForm({ ...form, schedule_mode: 'run_now' })} />
              <RunOption active={form.schedule_mode === 'schedule_later'} icon={CalendarClock} title="Schedule" text="Run during a chosen testing window." onClick={() => setForm({ ...form, schedule_mode: 'schedule_later' })} />
            </div>
            {form.schedule_mode === 'schedule_later' ? <div className="grid gap-4 md:grid-cols-3"><Field label="Date"><Input type="date" value={form.schedule_date} onChange={(event) => setForm({ ...form, schedule_date: event.target.value })} /></Field><Field label="Start time"><Input type="time" value={form.schedule_time} onChange={(event) => setForm({ ...form, schedule_time: event.target.value })} /></Field><Field label="Time zone"><Input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></Field><Field label="Repeat"><Select value={form.recurrence_rule} onChange={(event) => setForm({ ...form, recurrence_rule: event.target.value })}><option value="once">One-time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></Field></div> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" disabled={validateMutation.isPending || !hasTargets} onClick={validateCurrentScan}><CheckCircle2 className="h-4 w-4" /> Readiness Check</Button>
              <button type="button" onClick={() => setShowModules((value) => !value)} className="text-sm font-semibold text-[#2563EB]">{showModules ? 'Hide checks' : 'Show checks'}</button>
            </div>
            {validation ? <ValidationPanel validation={validation} /> : <div className="rounded-2xl border border-[#E2E8F0] bg-slate-50 p-4 text-sm text-[#475569]">Readiness check confirms approved scope, safety controls, and launch requirements.</div>}
            {showModules ? <SelectedModulesPanel scanType={form.scan_category} advanced={form.scan_depth === 'deep'} /> : null}
          </CardContent>
        </Card> : null}

        <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-3 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:mx-0 sm:flex-row sm:flex-wrap sm:justify-between sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => router.push('/scans')}>Cancel</Button>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button className="w-full sm:w-auto" variant="secondary" disabled={createScan.isPending || !hasTargets} onClick={saveDraft}>Save Draft</Button>
            {step > 0 ? <Button className="w-full sm:w-auto" variant="outline" onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</Button> : null}
            {step < steps.length - 1 ? <Button className="col-span-2 w-full sm:w-auto" disabled={step === 1 && !hasTargets} onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Continue <ChevronRight className="h-4 w-4" /></Button> : <Button className="col-span-2 w-full sm:w-auto" disabled={!hasTargets || Boolean(validation && !validation.valid)} onClick={launch}><Rocket className="h-4 w-4" /> {form.schedule_mode === 'schedule_later' ? 'Create Schedule' : 'Launch Scan'}</Button>}
          </div>
        </div>
      </main>
      <aside className="space-y-6">
        <ScanSummaryPanel project={selectedProject?.name} authorization={selectableAssets.length ? 'Approved targets available' : 'Select approved targets'} scanType={form.scan_category} mode={form.assessment_mode} depth={form.scan_depth} assets={selectedAssetIds.length} schedule={scheduleLabel} validation={validation ?? undefined} />
        <ProfessionalSafetyCard />
      </aside>
    </div>
  </>;
}

function ScanWizardHeader({ step }: { step: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-soft"><div className="grid gap-2 sm:grid-cols-3">{steps.map((label, index) => <div key={label} className={`rounded-xl px-4 py-3 ${index === step ? 'bg-[#0B1F3A] text-white' : index < step ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-[#64748B]'}`}><p className="text-xs font-semibold uppercase tracking-wide">Step {index + 1}</p><p className="mt-1 font-semibold">{label}</p></div>)}</div></div>;
}

function TemplateCard({ template, active, onClick }: { template: (typeof scanTemplates)[number]; active: boolean; onClick: () => void }) {
  const Icon = template.icon;
  return <button type="button" onClick={onClick} className={`group rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'border-[#155EEF] ring-2 ring-[#155EEF]/15' : 'border-[#E2E8F0]'}`}><div className="flex items-start justify-between gap-4"><span className={materialIconClass(template.tone, active)}><Icon className="h-6 w-6" /></span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[#475569]">{template.subtitle}</span></div><h3 className="mt-4 text-lg font-bold text-[#0F172A]">{template.title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-[#64748B]">{template.description}</p><div className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#64748B]"><Clock className="h-4 w-4" /> {template.time}</div><div className="mt-4 flex flex-wrap gap-2">{template.checks.map((check) => <span key={check} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-[#475569]">{check}</span>)}</div></button>;
}

function TemplateToolbar({ query, group, onQueryChange, onGroupChange, resultCount }: { query: string; group: string; onQueryChange: (value: string) => void; onGroupChange: (value: string) => void; resultCount: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" /><Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search templates, checks, or scan types" className="pl-9" /></div><div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">{templateGroups.map((item) => <button key={item} type="button" onClick={() => onGroupChange(item)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${group === item ? 'border-[#155EEF] bg-blue-50 text-[#155EEF]' : 'border-slate-200 bg-white text-[#64748B] hover:border-[#155EEF]/50'}`}>{item}</button>)}</div></div><p className="mt-3 text-xs text-[#64748B]">Showing {resultCount} template{resultCount === 1 ? '' : 's'}. Selection updates the preview instantly.</p></div>;
}

function LiveTemplatePanel({ template, project, approvedTargets, selectedTargets }: { template: (typeof scanTemplates)[number]; project?: string; approvedTargets: number; selectedTargets: number }) {
  const Icon = template.icon;
  const readiness = project && selectedTargets ? 'Ready for configuration' : project ? 'Choose targets next' : 'Choose a project next';
  return <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className={materialIconClass(template.tone, true)}><Icon className="h-6 w-6" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Live Preview</p><h3 className="mt-1 text-lg font-bold text-[#0F172A]">{template.title}</h3></div></div><p className="mt-4 text-sm leading-6 text-[#64748B]">{template.description}</p><div className="mt-5 space-y-3 text-sm"><PreviewRow label="Project" value={project ?? 'Not selected'} /><PreviewRow label="Approved targets" value={`${approvedTargets}`} /><PreviewRow label="Selected targets" value={`${selectedTargets}`} /><PreviewRow label="Estimated time" value={template.time} /></div><div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="text-sm font-semibold text-[#0B1F3A]">{readiness}</p><p className="mt-1 text-xs leading-5 text-[#475569]">This panel changes as you select a template, project, and targets.</p></div></aside>;
}

function ConfigureStatus({ project, selectedTargets, approvedTargets, depth }: { project?: string; selectedTargets: number; approvedTargets: number; depth: string }) {
  const items = [
    { label: 'Project', value: project ?? 'Required', done: Boolean(project) },
    { label: 'Targets', value: selectedTargets ? `${selectedTargets} selected` : `${approvedTargets} available`, done: selectedTargets > 0 },
    { label: 'Intensity', value: titleCase(depth), done: true },
  ];
  return <div className="grid gap-3 md:grid-cols-3">{items.map((item) => <div key={item.label} className={`rounded-2xl border p-4 ${item.done ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">{item.label}</p>{item.done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}</div><p className="mt-2 font-semibold text-[#0F172A]">{item.value}</p></div>)}</div>;
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2"><span className="text-[#64748B]">{label}</span><strong className="text-right text-[#0F172A]">{value}</strong></div>;
}

function TemplatePill({ template }: { template: (typeof scanTemplates)[number] }) {
  const Icon = template.icon;
  return <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-[#0F172A]"><span className={miniIconClass(template.tone)}><Icon className="h-3.5 w-3.5" /></span> {template.title}</div>;
}

function DepthOption({ depth, active, onClick }: { depth: (typeof scanDepths)[number]; active: boolean; onClick: () => void }) {
  const Icon = depth.icon;
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${active ? 'border-[#155EEF] bg-blue-50' : 'border-[#E2E8F0] bg-white hover:border-[#155EEF]/50'}`}><Icon className={`h-5 w-5 ${active ? 'text-[#155EEF]' : 'text-[#64748B]'}`} /><h4 className="mt-3 font-semibold text-[#0F172A]">{depth.title}</h4><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#64748B]">{depth.time}</p><p className="mt-2 text-sm leading-6 text-[#64748B]">{depth.description}</p></button>;
}

function AccessModeCard({ mode, active, onClick }: { mode: (typeof accessModes)[number]; active: boolean; onClick: () => void }) {
  const Icon = mode.icon;
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'border-[#155EEF] bg-blue-50 ring-2 ring-[#155EEF]/10' : 'border-[#E2E8F0] bg-white hover:border-[#155EEF]/50'}`}><div className="flex items-start justify-between gap-3"><span className={`rounded-2xl p-3 ${active ? 'bg-[#155EEF] text-white' : 'bg-slate-100 text-[#475569]'}`}><Icon className="h-5 w-5" /></span><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#475569] shadow-sm">{mode.badge}</span></div><h4 className="mt-4 font-semibold text-[#0F172A]">{mode.title}</h4><p className="mt-2 text-sm leading-6 text-[#64748B]">{mode.description}</p><p className="mt-3 rounded-xl bg-white/70 p-3 text-xs leading-5 text-[#475569]"><strong>Good for:</strong> {mode.goodFor}</p></button>;
}

function EmptyTargets() {
  return <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-slate-50 p-8 text-center"><Radar className="mx-auto h-8 w-8 text-[#64748B]" /><h3 className="mt-3 font-semibold text-[#0F172A]">Select a project to load targets</h3><p className="mt-2 text-sm text-[#64748B]">Only approved in-scope assets can be selected for scanning.</p></div>;
}

function ReviewGrid({ template, project, targetCount, depth, mode }: { template: (typeof scanTemplates)[number]; project?: string; targetCount: number; depth: string; mode: string }) {
  const rows = [{ label: 'Template', value: template.title }, { label: 'Project', value: project ?? 'Not selected' }, { label: 'Targets', value: `${targetCount} selected` }, { label: 'Intensity', value: titleCase(depth) }, { label: 'Access', value: mode === 'black_box' ? 'Unauthenticated Scan' : mode === 'gray_box' ? 'Authenticated Scan' : 'Full Internal Review' }];
  return <div className="grid gap-3 md:grid-cols-5">{rows.map((row) => <div key={row.label} className="rounded-2xl border border-[#E2E8F0] bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">{row.label}</p><p className="mt-2 font-semibold text-[#0F172A]">{row.value}</p></div>)}</div>;
}

function RunOption({ active, icon: Icon, title, text, onClick }: { active: boolean; icon: LucideIcon; title: string; text: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-5 text-left transition ${active ? 'border-[#155EEF] bg-blue-50' : 'border-[#E2E8F0] bg-white hover:border-[#155EEF]/50'}`}><Icon className={`h-5 w-5 ${active ? 'text-[#155EEF]' : 'text-[#475569]'}`} /><h3 className="mt-3 font-semibold text-[#0F172A]">{title}</h3><p className="mt-2 text-sm text-[#64748B]">{text}</p></button>;
}

function ProfessionalSafetyCard() {
  return <Card><CardHeader><h2 className="font-semibold text-[#0F172A]">Safety controls</h2></CardHeader><CardContent className="space-y-3 text-sm text-[#475569]"><p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" /> Scope lock prevents out-of-scope scanning.</p><p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" /> Rate limiting and availability protections stay enabled.</p><p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" /> Reports keep evidence professional and hide scanner names.</p></CardContent></Card>;
}

function ValidationPanel({ validation }: { validation: ScanValidationResult }) {
  return <div className={`rounded-2xl border p-4 text-sm ${validation.valid ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><p className="font-semibold">{validation.valid ? 'Ready to launch' : 'Needs attention before launch'}</p>{validation.blocking_reasons.length ? <ul className="mt-2 list-disc space-y-1 pl-5">{validation.blocking_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}{validation.warnings.length ? <ul className="mt-2 list-disc space-y-1 pl-5">{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</div>;
}

function materialIconClass(tone: string, active: boolean) {
  const activeClass = 'rounded-2xl bg-[#155EEF] p-3 text-white shadow-sm';
  const tones: Record<string, string> = {
    red: 'rounded-2xl bg-red-50 p-3 text-red-600 ring-1 ring-red-100',
    blue: 'rounded-2xl bg-blue-50 p-3 text-[#155EEF] ring-1 ring-blue-100',
    violet: 'rounded-2xl bg-violet-50 p-3 text-violet-600 ring-1 ring-violet-100',
    cyan: 'rounded-2xl bg-cyan-50 p-3 text-cyan-700 ring-1 ring-cyan-100',
    emerald: 'rounded-2xl bg-emerald-50 p-3 text-emerald-700 ring-1 ring-emerald-100',
  };
  return active ? activeClass : tones[tone] ?? tones.blue;
}

function miniIconClass(tone: string) {
  const tones: Record<string, string> = {
    red: 'rounded-lg bg-red-50 p-1 text-red-600',
    blue: 'rounded-lg bg-blue-50 p-1 text-[#155EEF]',
    violet: 'rounded-lg bg-violet-50 p-1 text-violet-600',
    cyan: 'rounded-lg bg-cyan-50 p-1 text-cyan-700',
    emerald: 'rounded-lg bg-emerald-50 p-1 text-emerald-700',
  };
  return tones[tone] ?? tones.blue;
}
