'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { GitBranch, ZoomIn, ZoomOut, Maximize2, RefreshCw, Search, ExternalLink, X } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { useAssetGraph } from '@/hooks/use-assets';
import { useProjects } from '@/hooks/use-projects';
import type { AssetGraphNode, AssetGraphEdge } from '@/types';

// ── visual constants ─────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, { fill: string; stroke: string }> = {
  domain:     { fill: '#aeb6c2', stroke: '#d8dee7' },
  subdomain:  { fill: '#aeb6c2', stroke: '#d8dee7' },
  ip_address: { fill: '#aeb6c2', stroke: '#d8dee7' },
  url:        { fill: '#aeb6c2', stroke: '#d8dee7' },
  service:    { fill: '#aeb6c2', stroke: '#d8dee7' },
  cidr:       { fill: '#aeb6c2', stroke: '#d8dee7' },
  generic:    { fill: '#aeb6c2', stroke: '#d8dee7' },
};

const SCOPE_GLOW: Record<string, string> = {
  in_scope:       '#22c55e',
  pending_review: '#f59e0b',
  out_of_scope:   '#ef4444',
};

const RING_ORDER = ['domain', 'subdomain', 'url', 'ip_address', 'service', 'cidr', 'generic'];

function nodeR(type: string) {
  return { domain: 36, subdomain: 31, ip_address: 30, url: 29, service: 27, cidr: 30, generic: 28 }[type] ?? 28;
}

// ── layout: hierarchical radial ──────────────────────────────────────────────
interface SimNode extends AssetGraphNode {
  x: number; y: number;
  vx: number; vy: number;
  pinned?: boolean;
}

function radialLayout(
  nodes: AssetGraphNode[],
  edges: AssetGraphEdge[],
  W: number, H: number,
): SimNode[] {
  const cx = W / 2, cy = H / 2;

  // Group by type in ring order
  const groups: Record<string, AssetGraphNode[]> = {};
  RING_ORDER.forEach(t => { groups[t] = []; });
  nodes.forEach(n => {
    const t = RING_ORDER.includes(n.type) ? n.type : 'generic';
    groups[t].push(n);
  });

  // Build parent→children map for smarter angular placement
  const childrenOf = new Map<string, string[]>();
  edges.forEach(e => {
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e.target);
  });
  const parentOf = new Map<string, string>();
  edges.forEach(e => parentOf.set(e.target, e.source));

  // Assign angles: domains go in center cluster, others in rings
  const sim: SimNode[] = [];
  const idToSim = new Map<string, SimNode>();

  // Ring radii
  const radii: Record<string, number> = {
    domain:     0,          // center
    subdomain:  Math.min(W, H) * 0.22,
    url:        Math.min(W, H) * 0.30,
    ip_address: Math.min(W, H) * 0.34,
    service:    Math.min(W, H) * 0.42,
    cidr:       Math.min(W, H) * 0.30,
    generic:    Math.min(W, H) * 0.38,
  };

  RING_ORDER.forEach(type => {
    const group = groups[type];
    const r = radii[type] ?? Math.min(W, H) * 0.35;
    group.forEach((n, i) => {
      let angle: number;
      if (type === 'domain') {
        // spread domains evenly near center
        angle = (i / Math.max(group.length, 1)) * Math.PI * 2;
        const spread = group.length > 1 ? 60 : 0;
        const sn: SimNode = {
          ...n,
          x: cx + spread * Math.cos(angle),
          y: cy + spread * Math.sin(angle),
          vx: 0, vy: 0,
        };
        sim.push(sn);
        idToSim.set(n.id, sn);
        return;
      }
      // Try to place near parent's angle
      const pid = parentOf.get(n.id);
      const parent = pid ? idToSim.get(pid) : null;
      if (parent) {
        const siblings = (childrenOf.get(pid!) ?? []).filter(id => {
          const s = idToSim.get(id);
          return !s; // not yet placed
        });
        const totalSiblings = (childrenOf.get(pid!) ?? []).length;
        const sibIdx = (childrenOf.get(pid!) ?? []).indexOf(n.id);
        const baseAngle = Math.atan2(parent.y - cy, parent.x - cx);
        const spread = Math.min(Math.PI * 1.6, (Math.PI * 2) / Math.max(2, totalSiblings));
        angle = baseAngle + (sibIdx - (totalSiblings - 1) / 2) * spread;
      } else {
        angle = (i / Math.max(group.length, 1)) * Math.PI * 2;
      }
      const jitter = (Math.random() - 0.5) * 20;
      const sn: SimNode = {
        ...n,
        x: cx + (r + jitter) * Math.cos(angle),
        y: cy + (r + jitter) * Math.sin(angle),
        vx: 0, vy: 0,
      };
      sim.push(sn);
      idToSim.set(n.id, sn);
    });
  });

  // Refine with a short force pass
  const edgeList = edges
    .map(e => ({ src: idToSim.get(e.source), tgt: idToSim.get(e.target) }))
    .filter(e => e.src && e.tgt) as { src: SimNode; tgt: SimNode }[];

  for (let tick = 0; tick < 180; tick++) {
    const alpha = Math.max(0.005, 0.6 * (1 - tick / 160));

    // repulsion
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i], b = sim[j];
        const dx = a.x - b.x || 0.01, dy = a.y - b.y || 0.01;
        const d2 = dx * dx + dy * dy;
        const minDist = (nodeR(a.type) + nodeR(b.type) + 18) ** 2;
        const force = (Math.max(minDist, 3600) / d2 - 1) * alpha * 0.4;
        if (force > 0) {
          const d = Math.sqrt(d2);
          a.vx += dx / d * force; a.vy += dy / d * force;
          b.vx -= dx / d * force; b.vy -= dy / d * force;
        }
      }
    }

    // edge attraction (gentle)
    edgeList.forEach(({ src, tgt }) => {
      const dx = tgt.x - src.x, dy = tgt.y - src.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = radii[tgt.type] - radii[src.type] + 40;
      const f = ((d - ideal) / d) * 0.05 * alpha;
      src.vx += dx * f; src.vy += dy * f;
      tgt.vx -= dx * f; tgt.vy -= dy * f;
    });

    // integrate
    sim.forEach(n => {
      if (n.pinned) { n.vx = 0; n.vy = 0; return; }
      n.x += n.vx; n.y += n.vy;
      n.vx *= 0.75; n.vy *= 0.75;
      n.x = Math.max(20, Math.min(W - 20, n.x));
      n.y = Math.max(20, Math.min(H - 20, n.y));
    });
  }

  return sim;
}

// ── Canvas component ─────────────────────────────────────────────────────────
function GraphCanvas({ nodes, edges }: { nodes: AssetGraphNode[]; edges: AssetGraphEdge[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const rafRef    = useRef<number>(0);

  const state = useRef<{
    sim: SimNode[];
    lookup: Map<string, SimNode>;
    scale: number; panX: number; panY: number;
    drag: { node: SimNode; ox: number; oy: number } | null;
    pan:  { sx: number; sy: number; px: number; py: number } | null;
    hovered: SimNode | null;
    selected: SimNode | null;
    W: number; H: number;
  }>({ sim: [], lookup: new Map(), scale: 1, panX: 0, panY: 0,
       drag: null, pan: null, hovered: null, selected: null, W: 900, H: 680 });

  const [tooltip, setTooltip] = useState<{ x: number; y: number; n: SimNode } | null>(null);
  const [sel, setSel] = useState<SimNode | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { sim, lookup, scale, panX, panY, W, H, hovered, selected } = state.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#292d33';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    // edges
    edges.forEach(e => {
      const s = lookup.get(e.source), t = lookup.get(e.target);
      if (!s || !t) return;
      const isHighlighted = selected && (selected.id === s.id || selected.id === t.id);
      const isDimmed = selected && !isHighlighted;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = isHighlighted ? '#5eb7e8' : '#b4bac3';
      ctx.globalAlpha = isDimmed ? 0.12 : isHighlighted ? 0.95 : 0.8;
      ctx.lineWidth = isHighlighted ? 5 / scale : 1.5 / scale;
      ctx.stroke();
      // Arrow head, matching Neo4j Browser's directed relationships.
      const angle = Math.atan2(t.y - s.y, t.x - s.x);
      const endX = t.x - Math.cos(angle) * (nodeR(t.type) + 2);
      const endY = t.y - Math.sin(angle) * (nodeR(t.type) + 2);
      const arrow = 5 / scale;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - Math.cos(angle - Math.PI / 6) * arrow, endY - Math.sin(angle - Math.PI / 6) * arrow);
      ctx.lineTo(endX - Math.cos(angle + Math.PI / 6) * arrow, endY - Math.sin(angle + Math.PI / 6) * arrow);
      ctx.closePath();
      ctx.fillStyle = isHighlighted ? '#5eb7e8' : '#b4bac3';
      ctx.fill();
      if (e.relationship && !isDimmed) {
        const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
        let labelAngle = angle;
        if (labelAngle > Math.PI / 2 || labelAngle < -Math.PI / 2) labelAngle += Math.PI;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(labelAngle);
        ctx.font = `${10 / scale}px ui-monospace,monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const text = e.relationship;
        const width = ctx.measureText(text).width + 8 / scale;
        ctx.fillStyle = '#292d33';
        ctx.fillRect(-width / 2, -8 / scale, width, 16 / scale);
        ctx.fillStyle = isHighlighted ? '#b9e6ff' : '#e5e7eb';
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    });

    // nodes
    sim.forEach(n => {
      const r = nodeR(n.type);
      const tc = TYPE_COLOR[n.type] ?? TYPE_COLOR.generic;
      const isHov = hovered?.id === n.id;
      const isSel = selected?.id === n.id;
      const isNeighbor = selected && edges.some(e => (e.source === selected.id && e.target === n.id) || (e.target === selected.id && e.source === n.id));
      const isDimmed = selected && !isSel && !isNeighbor;
      ctx.globalAlpha = isDimmed ? 0.2 : 1;

      // Selected-node radial tool wheel, inspired by Neo4j Bloom.
      if (isSel) {
        const inner = r + 5;
        const outer = r + 28;
        const symbols = ['↗', '⌘', '◎'];
        for (let index = 0; index < 3; index++) {
          const start = -Math.PI / 2 + index * (Math.PI * 2 / 3) + 0.025;
          const end = -Math.PI / 2 + (index + 1) * (Math.PI * 2 / 3) - 0.025;
          ctx.beginPath();
          ctx.arc(n.x, n.y, outer, start, end);
          ctx.arc(n.x, n.y, inner, end, start, true);
          ctx.closePath();
          ctx.fillStyle = index === 1 ? '#536477' : '#596373';
          ctx.fill();
          ctx.strokeStyle = '#343a43';
          ctx.lineWidth = 1 / scale;
          ctx.stroke();
          const middle = (start + end) / 2;
          const iconRadius = (inner + outer) / 2;
          ctx.font = `600 ${15 / scale}px system-ui,sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#eef2f7';
          ctx.fillText(symbols[index], n.x + Math.cos(middle) * iconRadius, n.y + Math.sin(middle) * iconRadius);
        }
      }

      // glow ring for scope status
      if (n.scope_status) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + (isSel ? 5 : 3), 0, Math.PI * 2);
        ctx.fillStyle = SCOPE_GLOW[n.scope_status] ?? '#94a3b8';
        ctx.globalAlpha = isSel ? 0.55 : 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // node body
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? '#c2cad5' : tc.fill;
      if (isHov || isSel) {
        ctx.shadowColor = tc.stroke;
        ctx.shadowBlur = 14 / scale;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // stroke
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = isSel ? '#8b7338' : tc.stroke;
      ctx.lineWidth = (isSel ? 4 : 1) / scale;
      ctx.stroke();

      // Neo4j Browser-style label inside every node, truncated to two lines.
      const fontSize = (n.type === 'domain' ? 11 : 10) / scale;
      ctx.font = `600 ${fontSize}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      const maxChars = n.type === 'domain' ? 15 : 12;
      const clean = n.label.trim();
      const first = clean.slice(0, maxChars);
      const second = clean.length > maxChars ? clean.slice(maxChars, maxChars * 2 - 1) + (clean.length > maxChars * 2 - 1 ? '…' : '') : '';
      ctx.fillText(first, n.x, n.y - (second ? fontSize * 0.55 : 0));
      if (second) ctx.fillText(second, n.x, n.y + fontSize * 0.65);
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }, [edges]);

  // init on data change
  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const W = wrap.clientWidth  || 900;
    const H = wrap.clientHeight || 680;
    state.current.W = W; state.current.H = H;
    const sim = radialLayout(nodes, edges, W, H);
    state.current.sim     = sim;
    state.current.lookup  = new Map(sim.map(n => [n.id, n]));
    state.current.scale   = 1;
    state.current.panX    = 0;
    state.current.panY    = 0;
    state.current.selected = null;
    setSel(null); setTooltip(null);
    if (canvasRef.current) { canvasRef.current.width = W; canvasRef.current.height = H; }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [nodes, edges, draw]);

  function toCanvas(e: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { scale, panX, panY } = state.current;
    return { x: (e.clientX - rect.left - panX) / scale, y: (e.clientY - rect.top - panY) / scale };
  }

  function hit(cx: number, cy: number) {
    // search in reverse (top-drawn last)
    const sim = state.current.sim;
    for (let i = sim.length - 1; i >= 0; i--) {
      const n = sim[i];
      if (Math.hypot(n.x - cx, n.y - cy) <= nodeR(n.type) + 5) return n;
    }
    return null;
  }

  function wheelActionAt(cx: number, cy: number) {
    const selected = state.current.selected;
    if (!selected) return null;
    const distance = Math.hypot(selected.x - cx, selected.y - cy);
    const r = nodeR(selected.type);
    if (distance < r + 5 || distance > r + 30) return null;
    let angle = Math.atan2(cy - selected.y, cx - selected.x) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    return Math.min(2, Math.floor(angle / (Math.PI * 2 / 3)));
  }

  function runWheelAction(action: number) {
    const s = state.current;
    const selected = s.selected;
    if (!selected) return;
    if (action === 0) {
      window.location.assign(`/assets/${selected.id}`);
      return;
    }
    if (action === 1) {
      s.scale = Math.max(1.35, s.scale);
      s.panX = s.W / 2 - selected.x * s.scale;
      s.panY = s.H / 2 - selected.y * s.scale;
    } else {
      s.scale = 1;
      s.panX = s.W / 2 - selected.x;
      s.panY = s.H / 2 - selected.y;
      selected.pinned = false;
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }

  function onMouseMove(e: React.MouseEvent) {
    const s = state.current;
    const { x, y } = toCanvas(e);
    if (s.drag) {
      s.drag.node.x = x + s.drag.ox;
      s.drag.node.y = y + s.drag.oy;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    if (s.pan) {
      s.panX = s.pan.px + (e.clientX - s.pan.sx);
      s.panY = s.pan.py + (e.clientY - s.pan.sy);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    const wheelAction = wheelActionAt(x, y);
    if (wheelAction !== null) {
      if (canvasRef.current) canvasRef.current.style.cursor = 'pointer';
      setTooltip(null);
      return;
    }
    const h = hit(x, y);
    if (h?.id !== s.hovered?.id) {
      s.hovered = h ?? null;
      if (canvasRef.current) canvasRef.current.style.cursor = h ? 'pointer' : 'grab';
      setTooltip(h ? { x: e.clientX, y: e.clientY, n: h } : null);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    } else if (h) {
      setTooltip({ x: e.clientX, y: e.clientY, n: h });
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    const { x, y } = toCanvas(e);
    const wheelAction = wheelActionAt(x, y);
    if (wheelAction !== null) {
      runWheelAction(wheelAction);
      return;
    }
    const h = hit(x, y);
    if (h) {
      h.pinned = true;
      state.current.drag = { node: h, ox: h.x - x, oy: h.y - y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    } else {
      state.current.pan = { sx: e.clientX, sy: e.clientY, px: state.current.panX, py: state.current.panY };
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    const s = state.current;
    if (s.drag) {
      const { x, y } = toCanvas(e);
      const dx = s.drag.node.x - (x + s.drag.ox), dy = s.drag.node.y - (y + s.drag.oy);
      if (Math.hypot(dx, dy) < 5) {
        const next = s.selected?.id === s.drag.node.id ? null : s.drag.node;
        s.selected = next; setSel(next);
      }
      s.drag = null;
    }
    s.pan = null;
    if (canvasRef.current) canvasRef.current.style.cursor = s.hovered ? 'pointer' : 'grab';
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const s = state.current;
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    s.panX = mx - (mx - s.panX) * f;
    s.panY = my - (my - s.panY) * f;
    s.scale = Math.max(0.1, Math.min(5, s.scale * f));
    cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw);
  }

  function zoom(f: number) {
    const s = state.current;
    const cx = s.W / 2, cy = s.H / 2;
    s.panX = cx - (cx - s.panX) * f;
    s.panY = cy - (cy - s.panY) * f;
    s.scale = Math.max(0.1, Math.min(5, s.scale * f));
    cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw);
  }

  function resetView() {
    state.current.scale = 1; state.current.panX = 0; state.current.panY = 0;
    cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw);
  }

  return (
    <div ref={wrapRef} className="relative w-full rounded-xl overflow-hidden" style={{ height: 680 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ background: '#292d33', cursor: 'grab' }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          state.current.hovered = null; state.current.drag = null; state.current.pan = null;
          setTooltip(null);
          cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw);
        }}
        onWheel={onWheel}
      />

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
        {([[ ZoomIn, () => zoom(1.2) ], [ ZoomOut, () => zoom(1/1.2) ], [ Maximize2, resetView ]] as const).map(
          ([Icon, fn], i) => (
            <button key={i} onClick={fn as ()=>void}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/90 border border-slate-700 shadow text-slate-300 hover:bg-slate-800 backdrop-blur-sm">
              <Icon className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 rounded-xl bg-slate-950/90 backdrop-blur-sm border border-slate-700 px-3 py-2.5 shadow text-xs">
        <p className="mb-2 font-semibold text-[10px] uppercase tracking-wider text-slate-400">Node labels</p>
        <div className="space-y-1.5">
          {Object.entries(TYPE_COLOR).filter(([k]) => k !== 'generic').map(([t, c]) => (
            <div key={t} className="flex items-center gap-2 text-slate-300">
              <span className="h-3 w-3 rounded-full flex-shrink-0 border" style={{ background: c.fill, borderColor: c.stroke }} />
              {t.replace('_', ' ')}
            </div>
          ))}
        </div>
        <p className="mt-2.5 border-t border-slate-700 pt-2 text-[10px] text-slate-500">Scope ring</p>
        <div className="mt-1 space-y-1">
          {Object.entries(SCOPE_GLOW).map(([k, c]) => (
            <div key={k} className="flex items-center gap-2 text-slate-400">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: c }} />
              {k.replace(/_/g, ' ')}
            </div>
          ))}
        </div>
      </div>

      {/* Hint */}
      <p className="absolute bottom-3 right-3 z-10 text-[10px] text-slate-400 bg-slate-950/70 border border-slate-800 backdrop-blur-sm rounded px-1.5 py-1">
        scroll = zoom · drag node · drag canvas = pan · click = select
      </p>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-xl bg-slate-950 border border-slate-700 shadow-xl px-3 py-2.5 text-xs min-w-[180px]"
          style={{ left: tooltip.x + 14, top: tooltip.y - 16 }}
        >
          <p className="font-semibold text-slate-100 break-all">{tooltip.n.label}</p>
          <p className="mt-0.5 text-slate-400">:{tooltip.n.type.replace('_', ' ')}</p>
          {tooltip.n.scope_status && (
            <p className="mt-1 font-medium" style={{ color: SCOPE_GLOW[tooltip.n.scope_status] ?? '#64748b' }}>
              {tooltip.n.scope_status.replace(/_/g, ' ')}
            </p>
          )}
        </div>
      )}

      {/* Selection panel */}
      {sel && (
        <div className="absolute top-3 left-3 z-20 w-72 rounded-xl bg-slate-950/95 backdrop-blur-sm border border-slate-700 shadow-xl p-4 text-slate-200">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-3 w-3 flex-shrink-0 rounded-full"
              style={{ background: (TYPE_COLOR[sel.type] ?? TYPE_COLOR.generic).fill }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white break-all leading-snug">{sel.label}</p>
              <p className="mt-0.5 font-mono text-xs text-slate-400">:{sel.type.replace('_', ' ')}</p>
            </div>
          </div>
          {sel.scope_status && (
            <div className="mt-3 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ background: SCOPE_GLOW[sel.scope_status] ?? '#94a3b8' }} />
              <span className="text-xs" style={{ color: SCOPE_GLOW[sel.scope_status] ?? '#64748b' }}>
                {sel.scope_status.replace(/_/g, ' ')}
              </span>
            </div>
          )}
          <dl className="mt-3 space-y-1.5 border-t border-slate-800 pt-3 text-xs">
            {([['Environment', sel.environment], ['Approval', sel.approval_status], ['Source', sel.discovery_method || sel.source], ['Last observed', sel.last_observed_at ? new Date(sel.last_observed_at).toLocaleString() : null]] as const).map(([label, value]) => value ? (
              <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="truncate text-right text-slate-300">{value}</dd></div>
            ) : null)}
          </dl>
          <Link href={`/assets/${sel.id}`} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-500">
            Open asset <ExternalLink className="h-3 w-3" />
          </Link>
          <button
            onClick={() => { state.current.selected = null; setSel(null);
              cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw); }}
            className="mt-2 w-full rounded-lg border border-slate-700 py-1 text-xs text-slate-400 hover:bg-slate-800">
            Deselect
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function AssetGraphPage() {
  const projects  = useProjects();
  const [projectId, setProjectId] = useState('');
  const [query, setQuery] = useState('');
  const [nodeType, setNodeType] = useState('all');
  const pid  = projectId || projects.data?.[0]?.id;
  const graph = useAssetGraph(pid);

  const nodeCount = graph.data?.nodes?.length ?? 0;
  const edgeCount = graph.data?.edges?.length ?? 0;
  const nodeTypes = useMemo(() => Array.from(new Set((graph.data?.nodes ?? []).map(node => node.type))).sort(), [graph.data?.nodes]);
  const visibleGraph = useMemo(() => {
    const allNodes = graph.data?.nodes ?? [];
    const allEdges = graph.data?.edges ?? [];
    const typeNodes = nodeType === 'all' ? allNodes : allNodes.filter(node => node.type === nodeType);
    const typeIds = new Set(typeNodes.map(node => node.id));
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return { nodes: typeNodes, edges: allEdges.filter(edge => typeIds.has(edge.source) && typeIds.has(edge.target)) };
    }
    const matches = new Set(typeNodes.filter(node => `${node.label} ${node.value ?? ''} ${node.type}`.toLowerCase().includes(normalized)).map(node => node.id));
    const visibleIds = new Set(matches);
    allEdges.forEach(edge => {
      if (matches.has(edge.source)) visibleIds.add(edge.target);
      if (matches.has(edge.target)) visibleIds.add(edge.source);
    });
    const nodes = allNodes.filter(node => visibleIds.has(node.id) && (nodeType === 'all' || node.type === nodeType || !matches.has(node.id)));
    const ids = new Set(nodes.map(node => node.id));
    return { nodes, edges: allEdges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  }, [graph.data, nodeType, query]);

  return <>
    <PageHeader
      title="Asset Relationship Graph"
      description="Visualize root domains, subdomains, IPs, web applications, API endpoints, and repositories."
      breadcrumbs={[{ href: '/assets', label: 'Assets' }, { label: 'Graph' }]}
      actions={
        <button onClick={() => graph.refetch()} disabled={graph.isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${graph.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    />

    <Card className="mb-5 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(240px,1.5fr)_180px_auto] lg:items-center">
        <div>
          <Select value={pid ?? ''} onChange={e => setProjectId(e.target.value)}>
            <option value="">Choose project</option>
            {projects.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find node by domain, IP, URL, or label…" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          {query ? <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button> : null}
        </div>
        <Select value={nodeType} onChange={event => setNodeType(event.target.value)}>
          <option value="all">All node labels</option>
          {nodeTypes.map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
        </Select>
        {nodeCount > 0 && (
          <div className="flex justify-end gap-4 whitespace-nowrap text-sm text-slate-500">
            <span><strong className="text-[#0B1F3A]">{visibleGraph.nodes.length}</strong> / {nodeCount} nodes</span>
            <span><strong className="text-[#0B1F3A]">{visibleGraph.edges.length}</strong> / {edgeCount} edges</span>
          </div>
        )}
      </div>
    </Card>

    {graph.isLoading && (
      <Card className="flex items-center justify-center" style={{ height: 680 }}>
        <p className="text-slate-400 text-sm animate-pulse">Building graph…</p>
      </Card>
    )}

    {!graph.isLoading && nodeCount === 0 && (
      <EmptyState icon={GitBranch} title="No asset graph yet"
        description="Discover or add assets first — NoovaStack will connect related domains, IPs, web apps, APIs, and services."
        action="Start Asset Discovery" href="/assets/discovery" />
    )}

    {!graph.isLoading && nodeCount > 0 && visibleGraph.nodes.length === 0 && (
      <EmptyState icon={Search} title="No matching graph nodes" description="Try another search or node label filter." />
    )}

    {!graph.isLoading && visibleGraph.nodes.length > 0 && (
      <Card className="overflow-hidden border-slate-800 bg-slate-950 p-2 shadow-2xl">
        <GraphCanvas nodes={visibleGraph.nodes} edges={visibleGraph.edges} />
      </Card>
    )}
  </>;
}
