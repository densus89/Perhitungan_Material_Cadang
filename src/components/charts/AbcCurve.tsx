"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { AbcResult } from "../../domain/types";

const percent = (value: number) => `${value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function AbcCurve({ rows }: { rows: readonly AbcResult[] }) {
  const points = [{ quantityThroughPercent: 0, valueThroughPercent: 0 }, ...rows];
  return (
    <div>
      <div className="chart-key"><span className="key-line" aria-hidden="true" />Nilai perolehan kumulatif<span className="chart-key-note">Populasi efektif (%)</span></div>
      <div className="chart-visual" aria-hidden="true">
        <ResponsiveContainer width="100%" height={224} minWidth={0} initialDimension={{ width: 640, height: 224 }}>
          <LineChart data={points} margin={{ top: 16, right: 16, bottom: 8, left: -16 }} accessibilityLayer={false}>
            <CartesianGrid stroke="#e8edf0" vertical={false} />
            <XAxis dataKey="quantityThroughPercent" type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11, fill: "#607181" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11, fill: "#607181" }} axisLine={false} tickLine={false} />
            <ReferenceLine y={80} stroke="#aebdc5" strokeDasharray="4 4" />
            <Line type="linear" dataKey="valueThroughPercent" stroke="#087f83" strokeWidth={2.5} dot={{ r: 3, fill: "#087f83", strokeWidth: 0 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="table-scroll">
        <table className="data-table compact-table">
          <caption>Data kurva ABC</caption>
          <thead><tr><th scope="col">Material</th><th scope="col">Kelas</th><th scope="col" className="numeric">Populasi kumulatif</th><th scope="col" className="numeric">Nilai kumulatif</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.materialName}</th><td>{row.category}</td><td className="numeric">{percent(row.quantityThroughPercent)}</td><td className="numeric">{percent(row.valueThroughPercent)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
