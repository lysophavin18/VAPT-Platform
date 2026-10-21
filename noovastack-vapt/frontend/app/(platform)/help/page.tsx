import Link from 'next/link';
import { Bot, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, FileText, FolderKanban, Gauge, Network, Radar, Settings, ShieldCheck, UserCog } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';

const workflow = [
  ['Create project', 'Define the application or system being assessed.'],
  ['Register assets', 'Add only targets covered by written authorization.'],
  ['Approve scope', 'Confirm each target is in scope and approved.'],
  ['Request scan', 'Choose the profile, depth, and safe configuration.'],
  ['Security review', 'An authorized reviewer approves restricted work.'],
  ['Automatic scan', 'Approved scans start automatically and collect evidence.'],
  ['Fix and report', 'Review findings, remediate, retest, and export the report.'],
] as const;

const contents = [
  ['getting-started', 'Getting started'], ['dashboard-guide', 'Dashboard'], ['project-guide', 'Projects and engagements'],
  ['asset-guide', 'Assets and scope'], ['scan-guide', 'Request a scan'], ['approval-guide', 'Approval workflow'],
  ['monitoring-guide', 'Monitor scans'], ['findings-guide', 'Findings and remediation'], ['reports-guide', 'Reports and retests'],
  ['other-features', 'Other features'], ['roles-guide', 'Roles and permissions'], ['faq', 'Common questions'],
] as const;

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Product Documentation" description="A practical guide to using NoovaStack VAPT—from your first project to the final security report." />

      <Card className="overflow-hidden border-blue-100 bg-gradient-to-br from-[#0B5E9E] to-[#123A68] p-6 text-white dark:border-[#2A4D70] sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">Start here</p>
        <h2 className="mt-2 text-2xl font-bold">Complete an authorized assessment in seven steps</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-50">NoovaStack keeps scope, approval, execution, evidence, remediation, and reporting in one controlled workflow. Never scan a target without explicit authorization.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {workflow.map(([label, detail], index) => <div key={label} className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm"><span className="grid h-7 w-7 place-items-center rounded-full bg-white text-xs font-bold text-[#0B5E9E]">{index + 1}</span><p className="mt-3 font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-blue-100">{detail}</p></div>)}
        </div>
      </Card>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-[#2A394D] dark:bg-[#121C2B] xl:sticky xl:top-20">
          <p className="px-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#94A3B8]">On this page</p>
          <nav className="mt-2 space-y-1" aria-label="Documentation contents">
            {contents.map(([id, label]) => <a key={id} href={`#${id}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-blue-50 hover:text-[#0B5E9E] dark:text-[#B3C0D1] dark:hover:bg-[#172638] dark:hover:text-[#8CCCF0]">{label}<ChevronRight className="h-3.5 w-3.5" /></a>)}
          </nav>
        </aside>

        <main className="min-w-0 space-y-6">
          <GuideSection id="getting-started" icon={ShieldCheck} title="Getting started" summary="Sign in, understand your role, and begin with authorized scope.">
            <StepList steps={[
              ['Sign in', 'Use your organization email or username and password. MFA is not available in the current release.'],
              ['Check your role', 'Your role controls available actions. Project ownership controls which project data you can see.'],
              ['Open Dashboard', 'Review security score, open findings, active scans, and the highest-impact recommended actions.'],
              ['Confirm authorization', 'Before creating work, obtain written permission, target scope, testing window, and escalation contacts.'],
            ]} />
            <Callout>Normal users can see only their own projects. The system administrator can see all projects.</Callout>
          </GuideSection>

          <GuideSection id="dashboard-guide" icon={Gauge} title="Dashboard" summary="Understand current risk and decide what needs attention first." action={{ href: '/dashboard', label: 'Open Dashboard' }}>
            <p>The main dashboard shows the security score, active projects, running scans, open findings, reports, severity distribution, active work, and recommended next actions.</p>
            <p>Expand <strong>Detailed analytics</strong> and choose the view that matches your question:</p>
            <InfoGrid items={[
              ['Risk overview', 'Exposure trends, severity, highest-risk assets, and vulnerability categories.'],
              ['Scan health', 'Active progress, success rate, throughput, coverage, and duration.'],
              ['Fix progress', 'Remediation status, mean time to remediate, SLA, validation, and next actions.'],
              ['Platform operations', 'Approvals, automation, workers, evidence, and audit activity. Admin only.'],
            ]} />
          </GuideSection>

          <GuideSection id="project-guide" icon={FolderKanban} title="Projects and engagements" summary="Organize one authorized system or application and define how it may be tested." action={{ href: '/projects/new', label: 'Create Project' }}>
            <StepList steps={[
              ['Create the project', 'Enter a clear system name, description, and the correct environment.'],
              ['Open the project', 'Use the project workspace to review its assets, scans, findings, and activity.'],
              ['Create an engagement', 'Choose black-box, gray-box, or white-box mode and record dates and testing hours.'],
              ['Record rules of engagement', 'Document allowed techniques, prohibited actions, contacts, and stop conditions.'],
              ['Authorize the engagement', 'A privileged reviewer confirms permission before scans can proceed.'],
            ]} />
            <InfoGrid items={[
              ['Black box', 'External assessment without privileged internal knowledge.'],
              ['Gray box', 'Limited credentials, documentation, or user roles are provided.'],
              ['White box', 'Source code, architecture, dependencies, and deeper access are available.'],
            ]} />
          </GuideSection>

          <GuideSection id="asset-guide" icon={Network} title="Assets and scope" summary="Build an inventory and prevent unauthorized targets from reaching a scanner." action={{ href: '/assets', label: 'Open Assets' }}>
            <StepList steps={[
              ['Register or discover', 'Add a domain, URL, API, IP, repository, service, or container target.'],
              ['Verify ownership', 'Confirm the organization is authorized to test the exact target and environment.'],
              ['Set in scope', 'Scope status records that the asset is covered by the engagement.'],
              ['Approve the asset', 'Approval status allows an authorized asset to be selected for scanning.'],
              ['Group and monitor', 'Use asset groups, the asset graph, and domain monitoring for related targets.'],
            ]} />
            <Callout tone="warning">An asset must be both <strong>in scope</strong> and <strong>approved</strong>. Discovery does not automatically grant permission to scan.</Callout>
          </GuideSection>

          <GuideSection id="scan-guide" icon={Radar} title="Request a scan" summary="Choose targets and a safe scan profile; the platform handles validation and approval." action={{ href: '/scans/new', label: 'New Scan' }}>
            <StepList steps={[
              ['Select project', 'Choose the project and authorized engagement for the work.'],
              ['Select assets', 'Only use approved, in-scope assets from the same project.'],
              ['Choose category', 'Select vulnerability, web application, API, network, or container scanning.'],
              ['Choose profile and depth', 'Quick is lower impact; standard is broader; deep requires stronger review.'],
              ['Review configuration', 'Use safe options and verify the summary before submission.'],
              ['Submit once', 'The request enters validation and approval. Do not create duplicates while waiting.'],
            ]} />
            <Callout>When an administrator approves the request, the scan starts automatically. The requester does not need to click Start.</Callout>
          </GuideSection>

          <GuideSection id="approval-guide" icon={ClipboardCheck} title="Approval workflow" summary="Independently review restricted work before any scanner is dispatched." action={{ href: '/approvals', label: 'Open Approvals' }}>
            <p>Approvals are available to administrators, managers, and security-team members. Review the target, engagement, environment, profile, depth, testing window, and risk.</p>
            <InfoGrid items={[
              ['Approve', 'The backend validates scope again and automatically queues the scan.'],
              ['Reject', 'The scan is blocked and the decision reason is recorded.'],
              ['More information', 'The request returns to draft so the requester can correct or explain it.'],
              ['Expired', 'The authorization is no longer valid and a new review is required.'],
            ]} />
            <Callout tone="warning">A non-admin reviewer cannot approve their own restricted request.</Callout>
          </GuideSection>

          <GuideSection id="monitoring-guide" icon={Radar} title="Monitor scans" summary="Follow progress, evidence, and safety signals while work is running." action={{ href: '/scans?status=running', label: 'View Running Scans' }}>
            <p>The progress page shows stages, enabled modules, elapsed time, events, safety state, collected evidence, and candidate findings.</p>
            <InfoGrid items={[
              ['Running', 'The worker is executing approved modules.'], ['Paused', 'An authorized operator temporarily stopped the workflow.'],
              ['Completed', 'Execution finished; review findings and report data.'], ['Failed or blocked', 'Inspect events and safety reasons before retrying.'],
            ]} />
            <p>Use emergency stop when a scan leaves scope, affects availability, runs outside the approved window, or the system owner asks you to stop.</p>
          </GuideSection>

          <GuideSection id="findings-guide" icon={ShieldCheck} title="Findings and remediation" summary="Validate evidence, prioritize risk, and track each issue to closure." action={{ href: '/findings', label: 'Open Findings' }}>
            <StepList steps={[
              ['Review evidence', 'Confirm the affected asset, observation, reproduction detail, and supporting evidence.'],
              ['Validate the finding', 'Verify legitimate issues; reject noise or mark confirmed false positives appropriately.'],
              ['Prioritize', 'Use severity, exploitability, asset importance, and business impact—not severity alone.'],
              ['Remediate', 'Apply the recommended fix and record useful status or comments without secrets.'],
              ['Request retest', 'Run a focused validation after the fix reaches the relevant environment.'],
              ['Close with evidence', 'Treat an issue as resolved only after verification confirms the vulnerability is gone.'],
            ]} />
          </GuideSection>

          <GuideSection id="reports-guide" icon={FileText} title="Reports and retests" summary="Produce reviewed deliverables and verify that fixes work." action={{ href: '/reports', label: 'Open Reports' }}>
            <p>Reports are generated from stored scan, finding, and evidence data. Available formats include HTML, JSON, PDF, DOCX, Markdown, and evidence ZIP.</p>
            <StepList steps={[
              ['Review scope', 'Confirm the report contains only the intended project and engagement.'], ['Review findings', 'Check severity, evidence, remediation, and excluded false positives.'],
              ['Review wording', 'Human-review automatically generated and AI-assisted content.'], ['Export securely', 'Store and share the report as confidential security information.'],
              ['Retest fixes', 'Use Retests to verify remediated findings and update final status.'],
            ]} />
            <div className="mt-4"><Link href="/retests" className="font-semibold text-[#155EEF]">Open Retests →</Link></div>
          </GuideSection>

          <GuideSection id="other-features" icon={CalendarClock} title="Other features" summary="Use scheduled work, monitoring, AI assistance, and governance tools appropriately."><FeatureLinks /></GuideSection>

          <GuideSection id="roles-guide" icon={UserCog} title="Roles and permissions" summary="Role controls actions; project ownership controls which data is visible.">
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#2A394D]"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600 dark:bg-[#162233] dark:text-[#B3C0D1]"><tr><th className="px-4 py-3">Role</th><th className="px-4 py-3">Typical access</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-[#2A394D]">
              <RoleRow role="Viewer" detail="Read accessible projects, findings, reports, and dashboards." />
              <RoleRow role="Analyst / developer" detail="Create and operate authorized assessment work in owned projects." />
              <RoleRow role="Security team" detail="Review approvals and governance activity for accessible projects." />
              <RoleRow role="Manager" detail="Approve restricted work and manage workflows for accessible projects." />
              <RoleRow role="Administrator" detail="Global project visibility, user management, operations, CVSS, and system settings." />
            </tbody></table></div>
          </GuideSection>

          <GuideSection id="faq" icon={CheckCircle2} title="Common questions" summary="Quick answers for the most common workflow questions.">
            <div className="space-y-3">
              <Faq question="Why can’t I see another user’s project?" answer="Only the system administrator has global visibility. Other roles are limited to projects they own, even if they know another project ID." />
              <Faq question="Why can’t I select an asset for a scan?" answer="The asset must belong to the selected project and be both in scope and approved." />
              <Faq question="Do I click Start after approval?" answer="No. Successful approval revalidates the request and starts the scan automatically." />
              <Faq question="Why is my scan blocked?" answer="Check scope, asset approval, engagement authorization, testing window, configuration, approval expiry, and scan events." />
              <Faq question="Does a CVE match prove vulnerability?" answer="No. CVE intelligence is a prioritization signal. Validate the affected product, version, exposure, and evidence." />
              <Faq question="Can I use MFA?" answer="Not yet. MFA is not implemented in the current release." />
            </div>
          </GuideSection>
        </main>
      </div>
    </>
  );
}

function GuideSection({ id, icon: Icon, title, summary, action, children }: { id: string; icon: typeof ShieldCheck; title: string; summary: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft dark:border-[#2A394D] dark:bg-[#121C2B] sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-[#2A394D]"><div className="flex min-w-0 items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#155EEF] dark:bg-[#172638] dark:text-[#8CCCF0]"><Icon className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-[#0B1F3A] dark:text-[#F1F5F9]">{title}</h2><p className="mt-1 text-sm text-slate-600 dark:text-[#94A3B8]">{summary}</p></div></div>{action ? <Link href={action.href} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-[#155EEF] hover:bg-blue-100 dark:border-[#31506F] dark:bg-[#172638] dark:text-[#8CCCF0]">{action.label}</Link> : null}</div><div className="mt-5 space-y-4 text-sm leading-6 text-slate-700 dark:text-[#C6D1DF]">{children}</div></section>;
}

function StepList({ steps }: { steps: Array<[string, string]> }) {
  return <ol className="space-y-3">{steps.map(([title, detail], index) => <li key={title} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#EAF2FF] text-xs font-bold text-[#155EEF] dark:bg-[#172638] dark:text-[#8CCCF0]">{index + 1}</span><div><strong className="text-[#0B1F3A] dark:text-[#F1F5F9]">{title}</strong><p className="text-slate-600 dark:text-[#94A3B8]">{detail}</p></div></li>)}</ol>;
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return <div className="grid gap-3 sm:grid-cols-2">{items.map(([title, detail]) => <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#2A394D] dark:bg-[#151F2E]"><p className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">{title}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-[#94A3B8]">{detail}</p></div>)}</div>;
}

function Callout({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warning' }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-[#59451D] dark:bg-[#241C0F] dark:text-amber-200' : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-[#31506F] dark:bg-[#102A43] dark:text-blue-100'}`}>{children}</div>;
}

function FeatureLinks() {
  const features = [
    { icon: CalendarClock, title: 'Schedules', detail: 'Run recurring approved scans. Schedules have their own authorization and execution history.', href: '/schedules' },
    { icon: Network, title: 'Domain monitoring', detail: 'Monitor approved domains for asset and exposure changes while preserving project isolation.', href: '/assets/monitoring' },
    { icon: Bot, title: 'Generative AI', detail: 'Get planning, remediation, and report assistance. Never include credentials or unrelated customer data.', href: '/ai-agents' },
    { icon: Settings, title: 'Administration', detail: 'Manage users, roles, scanner tools, CVE intelligence, and platform settings. Admin only.', href: '/administration' },
  ];
  return <div className="grid gap-3 sm:grid-cols-2">{features.map(({ icon: Icon, title, detail, href }) => <Link key={title} href={href} className="rounded-xl border border-slate-200 p-4 transition hover:border-[#155EEF]/50 hover:bg-blue-50/50 dark:border-[#2A394D] dark:hover:bg-[#172638]"><div className="flex items-center gap-2 font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]"><Icon className="h-4 w-4 text-[#155EEF]" />{title}</div><p className="mt-2 text-xs leading-5 text-slate-600 dark:text-[#94A3B8]">{detail}</p></Link>)}</div>;
}

function RoleRow({ role, detail }: { role: string; detail: string }) { return <tr><td className="whitespace-nowrap px-4 py-3 font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">{role}</td><td className="px-4 py-3 text-slate-600 dark:text-[#94A3B8]">{detail}</td></tr>; }
function Faq({ question, answer }: { question: string; answer: string }) { return <details className="rounded-xl border border-slate-200 p-4 dark:border-[#2A394D]"><summary className="cursor-pointer font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">{question}</summary><p className="mt-2 text-slate-600 dark:text-[#94A3B8]">{answer}</p></details>; }
