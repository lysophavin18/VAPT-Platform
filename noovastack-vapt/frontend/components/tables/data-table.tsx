import { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, data, empty }: { columns: Column<T>[]; data: T[]; empty?: ReactNode }) {
  if (!data.length) return <>{empty ?? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No records found.</div>}</>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{columns.map((column) => <th key={column.key} className="px-4 py-3">{column.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row, index) => (
            <tr key={index} className="hover:bg-slate-50">
              {columns.map((column) => <td key={column.key} className="px-4 py-4 align-top text-slate-700">{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
