'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const data = [{ name: 'Running', value: 8, color: '#22C55E' }, { name: 'Reviewing', value: 3, color: '#F59E0B' }, { name: 'Completed', value: 6, color: '#2F80ED' }, { name: 'Failed', value: 1, color: '#EF4444' }, { name: 'Idle', value: 1, color: '#64748B' }];

export function TasksStatusChart() {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return <section className="rounded-2xl border border-[#223044] bg-[#0D1928] p-4"><h2 className="font-semibold text-white">Tasks by Status</h2><p className="sr-only">Tasks by status total {total}: running 8, reviewing 3, completed 6, failed 1, idle 1.</p><div className="relative mt-4 h-56"><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" innerRadius={58} outerRadius={86} paddingAngle={2}>{data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="absolute inset-0 grid place-items-center"><div className="text-center"><p className="text-3xl font-bold text-white">{total}</p><p className="text-xs text-[#94A3B8]">Total</p></div></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm">{data.map((item) => <div key={item.name} className="flex items-center gap-2 text-[#94A3B8]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}: {item.value}</div>)}</div></section>;
}
