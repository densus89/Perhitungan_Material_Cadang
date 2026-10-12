"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { AbcCategory, AbcResult } from "../../domain/types";

const classes: { category: AbcCategory; color: string; description: string }[] = [
  { category: "A1", color: "#087f83", description: "Mandatory" },
  { category: "A2", color: "#3c9e9f", description: "Optimum" },
  { category: "B1", color: "#6e9db2", description: "Optimum / Economic" },
  { category: "B2", color: "#a6bcc7", description: "Economic" },
  { category: "C", color: "#d7e0e6", description: "Tidak dicadangkan" },
];

export function ClassDistribution({ rows }: { rows: readonly AbcResult[] }) {
  const distribution = classes.map((item) => ({ ...item, count: rows.filter((row) => row.category === item.category).length }));
  return (
    <div>
      <div className="distribution-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height={192} minWidth={0} initialDimension={{ width: 320, height: 192 }}>
          <PieChart accessibilityLayer={false}><Pie data={distribution} dataKey="count" nameKey="category" innerRadius={57} outerRadius={80} paddingAngle={3} stroke="none" isAnimationActive={false}>{distribution.map((item) => <Cell key={item.category} fill={item.color} />)}</Pie></PieChart>
        </ResponsiveContainer>
        <div className="donut-total"><strong>{rows.length}</strong><span>kelompok ABC</span></div>
      </div>
      <table className="data-table class-table">
        <caption>Distribusi kelas ABC</caption>
        <thead><tr><th scope="col">Kelas</th><th scope="col">Kebijakan</th><th scope="col" className="numeric">Kelompok</th></tr></thead>
        <tbody>{distribution.map((item) => <tr key={item.category}><th scope="row"><span className="class-dot" style={{ background: item.color }} aria-hidden="true" />{item.category}</th><td>{item.description}</td><td className="numeric">{item.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
