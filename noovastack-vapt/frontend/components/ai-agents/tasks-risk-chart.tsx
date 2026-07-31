'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const data = [{ name: 'Low', value: 11 }, { name: 'Medium', value: 5 }, { name: 'High', value: 2 }, { name: 'Critical', value: 0 }];

export function TasksRiskChart() {
  return <section className="rounded-2xl border border-[#223044] bg-[#0D1928] p-4"><h2 className="font-semibold text-white">Tasks by Risk Level</h2><p className="sr-only">Tasks by risk: low 11, medium 5, high 2, critical 0.</p><div className="mt-4 h-56"><ResponsiveContainer><BarChart data={data}><CartesianGrid stroke="#223044" vertical={false} /><XAxis dataKey="name" stroke="#94A3B8" fontSize={12} /><YAxis stroke="#94A3B8" fontSize={12} allowDecimals={false} /><Tooltip cursor={{ fill: '#111E2E' }} contentStyle={{ background: '#0D1928', border: '1px solid #223044', color: '#F8FAFC' }} /><Bar dataKey="value" fill="#E51C2A" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></section>;
}
