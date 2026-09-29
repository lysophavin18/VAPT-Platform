'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type InlineToken = { type: 'text' | 'bold' | 'italic' | 'code' | 'link'; content: string; href?: string };

const INLINE_PATTERN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\))|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text))) {
    if (match.index > lastIndex) tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    const raw = match[0];
    if (raw.startsWith('`')) tokens.push({ type: 'code', content: raw.slice(1, -1) });
    else if (raw.startsWith('**')) tokens.push({ type: 'bold', content: raw.slice(2, -2) });
    else if (raw.startsWith('__')) tokens.push({ type: 'bold', content: raw.slice(2, -2) });
    else if (raw.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(raw);
      tokens.push({ type: 'link', content: linkMatch?.[1] ?? raw, href: linkMatch?.[2] });
    } else if (raw.startsWith('*')) tokens.push({ type: 'italic', content: raw.slice(1, -1) });
    else if (raw.startsWith('_')) tokens.push({ type: 'italic', content: raw.slice(1, -1) });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) tokens.push({ type: 'text', content: text.slice(lastIndex) });
  return tokens;
}

/** Renders a single line/phrase of inline Markdown (bold, italic, inline code, links). No block structure. */
export function MarkdownInline({ text }: { text: string }) {
  const tokens = tokenizeInline(text ?? '');
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === 'bold') return <strong key={i} className="font-semibold text-[var(--text)]">{token.content}</strong>;
        if (token.type === 'italic') return <em key={i}>{token.content}</em>;
        if (token.type === 'code') return <code key={i} className="rounded bg-[var(--surface-2)] px-[5px] py-[1px] font-mono text-[12px] text-[var(--accent)]">{token.content}</code>;
        if (token.type === 'link') return <a key={i} href={token.href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]">{token.content}</a>;
        return <span key={i}>{token.content}</span>;
      })}
    </>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="my-2 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-2.5 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{language || 'code'}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
          {copied ? <Check className="h-3 w-3 text-[var(--success)]" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-2.5 py-2 text-[12px] leading-[1.5] text-[var(--text)]"><code className="font-mono">{code}</code></pre>
    </div>
  );
}

const FENCE = /^```/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
const BLANK = /^\s*$/;

/** Renders a block of AI-authored Markdown: paragraphs, headings, lists, and fenced code blocks. */
export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (FENCE.test(line.trim())) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(<CodeBlock key={key++} code={codeLines.join('\n')} language={language} />);
      continue;
    }

    if (BLANK.test(line)) {
      i += 1;
      continue;
    }

    const headingMatch = HEADING.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizeClass = level === 1 ? 'text-[15px]' : level === 2 ? 'text-[14px]' : 'text-[13px]';
      blocks.push(<p key={key++} className={`${sizeClass} font-semibold text-[var(--text)]`}><MarkdownInline text={headingMatch[2]} /></p>);
      i += 1;
      continue;
    }

    if (BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(lines[i].replace(BULLET, ''));
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-1 pl-4">
          {items.map((item, idx) => <li key={idx} className="text-[13px] leading-[1.5]"><MarkdownInline text={item} /></li>)}
        </ul>
      );
      continue;
    }

    if (ORDERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        items.push(lines[i].replace(ORDERED, ''));
        i += 1;
      }
      blocks.push(
        <ol key={key++} className="list-decimal space-y-1 pl-4">
          {items.map((item, idx) => <li key={idx} className="text-[13px] leading-[1.5]"><MarkdownInline text={item} /></li>)}
        </ol>
      );
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && !BLANK.test(lines[i]) && !FENCE.test(lines[i].trim()) && !HEADING.test(lines[i]) && !BULLET.test(lines[i]) && !ORDERED.test(lines[i])) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="text-[13px] leading-[1.55]">
        {paraLines.map((paraLine, idx) => (
          <span key={idx}>
            <MarkdownInline text={paraLine} />
            {idx < paraLines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
  }

  return <div className={`space-y-2 ${className ?? ''}`}>{blocks}</div>;
}

/** Renders a list item that may itself contain a fenced code block, falling back to inline-only formatting. */
export function MarkdownItem({ text }: { text: string }) {
  if (text.includes('```')) return <MarkdownLite text={text} />;
  return <MarkdownInline text={text} />;
}
