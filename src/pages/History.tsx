import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Measurement } from "../lib/api";

const RANGES = [
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
];

export default function History() {
  const [rangeMs, setRangeMs] = useState(RANGES[1].ms);
  const [rows, setRows] = useState<Measurement[]>([]);

  useEffect(() => {
    api.listMeasurements(Date.now() - rangeMs).then(setRows).catch(console.error);
  }, [rangeMs]);

  const throughputs = rows
    .filter((r) => r.kind === "throughput" && r.down_mbps != null)
    .map((r) => ({
      t: new Date(r.ts).toLocaleString([], {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      down: r.down_mbps ?? 0,
      up: r.up_mbps ?? 0,
    }));

  return (
    <div>
      <div className="spaced">
        <h2>History</h2>
        <div className="row">
          {RANGES.map((r) => (
            <button
              key={r.label}
              className={r.ms === rangeMs ? "" : "secondary"}
              onClick={() => setRangeMs(r.ms)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Throughput probes ({throughputs.length})</div>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={throughputs}>
              <CartesianGrid stroke="#232833" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="#8b95a7" fontSize={10} interval="preserveStartEnd" minTickGap={48} />
              <YAxis stroke="#8b95a7" fontSize={11} label={{ value: "Mbps", angle: -90, position: "insideLeft", fill: "#8b95a7", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0c0f14", border: "1px solid #232833" }} />
              <Bar dataKey="down" fill="#4f8cff" />
              <Bar dataKey="up" fill="#36c98a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
