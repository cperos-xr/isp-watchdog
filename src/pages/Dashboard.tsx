import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type DashboardSnapshot, type Measurement } from "../lib/api";
import { HealthPill } from "../components/HealthPill";

const COLOR = {
  healthy: "#36c98a",
  degraded: "#f5a623",
  outage: "#e84855",
  accent: "#4f8cff",
  accent2: "#a78bfa",
  muted: "#8b95a7",
  grid: "#232833",
};

const RANGES = [
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
];

type Health = "Healthy" | "Degraded" | "Outage";

export default function Dashboard() {
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);
  const [series, setSeries] = useState<Measurement[]>([]);
  const [rangeMs, setRangeMs] = useState(RANGES[0].ms);
  const [busy, setBusy] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  async function refresh(ms: number) {
    const [s, rows] = await Promise.all([
      api.dashboardSnapshot(),
      api.listMeasurements(Date.now() - ms),
    ]);
    setSnap(s);
    setSeries(rows);
  }

  useEffect(() => {
    refresh(rangeMs).catch(console.error);
    const i = setInterval(() => refresh(rangeMs).catch(console.error), 15000);
    return () => clearInterval(i);
  }, [rangeMs]);

  async function runNow() {
    setBusy(true);
    setTestStatus("Speed test running — downloads ~10 MB, takes ~60 s…");
    const startedAt = Date.now();
    try {
      await api.runThroughputNow();
    } catch {
      setBusy(false);
      setTestStatus(null);
      return;
    }
    // Poll until a new throughput row appears (max 3 min).
    const pollId = setInterval(async () => {
      const rows = await api.listMeasurements(startedAt).catch(() => []);
      const got = rows.find((m) => m.kind === "throughput");
      if (got) {
        clearInterval(pollId);
        clearTimeout(giveUpId);
        setBusy(false);
        setTestStatus(
          got.down_mbps != null
            ? `Done — ${got.down_mbps.toFixed(1)} Mbps down${got.up_mbps != null ? `, ${got.up_mbps.toFixed(1)} Mbps up` : ""}`
            : "Test complete — refreshing…"
        );
        setTimeout(() => setTestStatus(null), 5000);
        refresh(rangeMs).catch(console.error);
      }
    }, 3000);
    const giveUpId = setTimeout(() => {
      clearInterval(pollId);
      setBusy(false);
      setTestStatus(null);
      refresh(rangeMs).catch(console.error);
    }, 180_000);
  }

  const last = snap?.last_measurement;
  const advertised = snap?.plan?.advertised_down ?? null;
  const advertisedUp = snap?.plan?.advertised_up ?? null;

  // --- derived series ----------------------------------------------------------
  const fmtT = useMemo(() => makeTickFormatter(rangeMs), [rangeMs]);

  const latencyData = useMemo(
    () =>
      series
        .filter((m) => m.kind === "latency")
        .map((m) => ({
          ts: m.ts,
          gateway: m.gateway_rtt_ms ?? null,
          internet: m.internet_rtt_ms ?? null,
        })),
    [series]
  );
  const throughputData = useMemo(
    () =>
      series
        .filter((m) => m.kind === "throughput")
        .map((m) => ({
          ts: m.ts,
          down: m.down_mbps ?? null,
          up: m.up_mbps ?? null,
        })),
    [series]
  );
  const lossData = useMemo(
    () =>
      series
        .filter((m) => m.kind === "latency")
        .map((m) => ({
          ts: m.ts,
          loss: m.internet_loss_pct == null ? null : m.internet_loss_pct * 100,
        })),
    [series]
  );
  const dnsData = useMemo(
    () =>
      series
        .filter((m) => m.kind === "latency" && m.dns_ms != null)
        .map((m) => ({ ts: m.ts, dns: m.dns_ms })),
    [series]
  );

  // health distribution and hour-of-day patterns
  const healthDist = useMemo(() => buildHealthDist(series), [series]);
  const hourly = useMemo(() => buildHourlyThroughput(series), [series]);

  // top-line KPIs
  const kpis = useMemo(() => buildKpis(series, advertised), [series, advertised]);

  return (
    <div>
      <div className="spaced" style={{ marginBottom: 16 }}>
        <h2>Dashboard</h2>
        <div className="row" style={{ gap: 8 }}>
          <HealthPill state={snap?.state ?? "Unknown"} />
          {RANGES.map((r) => (
            <button
              key={r.label}
              className={r.ms === rangeMs ? "" : "secondary"}
              onClick={() => setRangeMs(r.ms)}
            >
              {r.label}
            </button>
          ))}
          <button onClick={runNow} disabled={busy}>
            {busy ? "Running…" : "Run Speed Test"}
          </button>
        </div>
      </div>
      {testStatus && (
        <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
          {testStatus}
        </div>
      )}

      <div className="grid">
        <Kpi
          label="Speed delivered"
          value={kpis.deliveredPct == null ? "—" : `${kpis.deliveredPct.toFixed(0)}%`}
          sub={
            advertised
              ? `median ${fmtMbps(kpis.medianDown)} of ${fmtMbps(advertised)} advertised`
              : "set advertised speed in Settings"
          }
          tone={kpis.deliveredPct == null ? "neutral" : kpis.deliveredPct >= 80 ? "good" : "bad"}
        />
        <Kpi
          label="Uptime"
          value={kpis.uptimePct == null ? "—" : `${kpis.uptimePct.toFixed(1)}%`}
          sub={`${kpis.healthyN} healthy of ${kpis.totalN} probes`}
          tone={kpis.uptimePct == null ? "neutral" : kpis.uptimePct >= 99 ? "good" : "bad"}
        />
        <Kpi
          label="Median internet RTT"
          value={kpis.medianInternetRtt == null ? "—" : `${kpis.medianInternetRtt.toFixed(0)} ms`}
          sub={
            kpis.medianGatewayRtt == null
              ? "no gateway data yet"
              : `gateway ${kpis.medianGatewayRtt.toFixed(1)} ms`
          }
          tone={kpis.medianInternetRtt == null ? "neutral" : kpis.medianInternetRtt < 60 ? "good" : "bad"}
        />
        <Kpi
          label="Now"
          value={
            last?.down_mbps != null
              ? `${last.down_mbps.toFixed(1)} Mbps`
              : last?.internet_rtt_ms != null
              ? `${last.internet_rtt_ms.toFixed(0)} ms`
              : "—"
          }
          sub={last?.ts ? `last probe ${timeAgo(last.ts)}` : "no probes yet"}
        />
      </div>

      <div className="chart-grid">
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-title">Throughput (Mbps)</div>
          <Legend
            items={[
              { color: COLOR.accent, label: `Download${advertised ? ` — advertised ${advertised}` : ""}` },
              { color: COLOR.healthy, label: `Upload${advertisedUp ? ` — advertised ${advertisedUp}` : ""}` },
            ]}
          />
          <ChartBox empty={throughputData.length === 0} hint="no throughput probes in this range yet">
            <LineChart data={throughputData} margin={chartMargins}>
              <CartesianGrid stroke={COLOR.grid} strokeDasharray="3 3" />
              <XAxis dataKey="ts" stroke={COLOR.muted} fontSize={11} minTickGap={48} tickFormatter={fmtT} />
              <YAxis stroke={COLOR.muted} fontSize={11} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => new Date(Number(v)).toLocaleString()} />
              {advertised && <ReferenceLine y={advertised} stroke={COLOR.accent} strokeDasharray="4 4" />}
              {advertisedUp && <ReferenceLine y={advertisedUp} stroke={COLOR.healthy} strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="down" stroke={COLOR.accent} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="up" stroke={COLOR.healthy} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ChartBox>
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-title">Latency (ms)</div>
          <Legend
            items={[
              { color: COLOR.healthy, label: "Gateway (your router)" },
              { color: COLOR.accent, label: "Internet (median of public targets)" },
            ]}
          />
          <ChartBox empty={latencyData.length === 0} hint="no latency probes yet">
            <LineChart data={latencyData} margin={chartMargins}>
              <CartesianGrid stroke={COLOR.grid} strokeDasharray="3 3" />
              <XAxis dataKey="ts" stroke={COLOR.muted} fontSize={11} minTickGap={48} tickFormatter={fmtT} />
              <YAxis stroke={COLOR.muted} fontSize={11} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => new Date(Number(v)).toLocaleString()} />
              <Line type="monotone" dataKey="gateway" stroke={COLOR.healthy} strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="internet" stroke={COLOR.accent} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ChartBox>
        </div>

        <div className="card">
          <div className="card-title">Packet loss to internet (%)</div>
          <ChartBox empty={lossData.length === 0} hint="no probes yet">
            <AreaChart data={lossData} margin={chartMargins}>
              <CartesianGrid stroke={COLOR.grid} strokeDasharray="3 3" />
              <XAxis dataKey="ts" stroke={COLOR.muted} fontSize={11} minTickGap={48} tickFormatter={fmtT} />
              <YAxis stroke={COLOR.muted} fontSize={11} domain={[0, 100]} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => new Date(Number(v)).toLocaleString()} />
              <Area type="monotone" dataKey="loss" stroke={COLOR.outage} fill={COLOR.outage} fillOpacity={0.25} />
            </AreaChart>
          </ChartBox>
        </div>

        <div className="card">
          <div className="card-title">Connection health distribution</div>
          <Legend
            items={[
              { color: COLOR.healthy, label: `Healthy ${pctOf(healthDist, "Healthy")}` },
              { color: COLOR.degraded, label: `Degraded ${pctOf(healthDist, "Degraded")}` },
              { color: COLOR.outage, label: `Outage ${pctOf(healthDist, "Outage")}` },
            ]}
          />
          <ChartBox empty={healthDist.every((d) => d.value === 0)} hint="no probes yet">
            <PieChart>
              <Pie
                data={healthDist}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                stroke="none"
              >
                {healthDist.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} formatter={(v: number, name) => [`${v} probes`, name]} />
            </PieChart>
          </ChartBox>
        </div>

        <div className="card">
          <div className="card-title">Throughput by hour of day (Mbps)</div>
          <ChartBox empty={hourly.every((d) => d.down == null)} hint="need at least a day of throughput probes">
            <BarChart data={hourly} margin={chartMargins}>
              <CartesianGrid stroke={COLOR.grid} strokeDasharray="3 3" />
              <XAxis dataKey="hour" stroke={COLOR.muted} fontSize={11} />
              <YAxis stroke={COLOR.muted} fontSize={11} />
              <Tooltip {...tooltipStyle} />
              {advertised && <ReferenceLine y={advertised} stroke={COLOR.accent} strokeDasharray="4 4" />}
              <Bar dataKey="down" fill={COLOR.accent} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartBox>
        </div>

        <div className="card">
          <div className="card-title">DNS resolution time (ms)</div>
          <ChartBox empty={dnsData.length === 0} hint="no DNS samples yet">
            <LineChart data={dnsData} margin={chartMargins}>
              <CartesianGrid stroke={COLOR.grid} strokeDasharray="3 3" />
              <XAxis dataKey="ts" stroke={COLOR.muted} fontSize={11} minTickGap={48} tickFormatter={fmtT} />
              <YAxis stroke={COLOR.muted} fontSize={11} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => new Date(Number(v)).toLocaleString()} />
              <Line type="monotone" dataKey="dns" stroke={COLOR.accent2} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ChartBox>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Connection</div>
        <div className="grid">
          <Field label="Link" value={`${last?.link_type ?? "—"} ${last?.link_speed_mbps ? `(${last.link_speed_mbps} Mbps)` : ""}`} />
          <Field label="Gateway IP" value={last?.gateway_ip ?? "—"} />
          <Field label="Public IP" value={last?.public_ip ?? "—"} />
          <Field label="ASN" value={last?.asn_org ?? last?.asn ?? "—"} />
        </div>
      </div>
    </div>
  );
}

// --- helpers --------------------------------------------------------------------

const chartMargins = { top: 8, right: 16, left: 0, bottom: 0 };
const tooltipStyle = {
  contentStyle: { background: "#0c0f14", border: "1px solid #232833", fontSize: 12 },
  labelStyle: { color: "#8b95a7" },
};

function ChartBox({
  children,
  empty,
  hint,
}: {
  children: React.ReactElement;
  empty: boolean;
  hint: string;
}) {
  return (
    <div style={{ width: "100%", height: 220, position: "relative" }}>
      <ResponsiveContainer>{children}</ResponsiveContainer>
      {empty && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--muted)",
            fontSize: 12,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="legend-row">
      {items.map((i) => (
        <span key={i.label}>
          <span className="dot" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good" ? "var(--healthy)" : tone === "bad" ? "var(--outage)" : "var(--text)";
  return (
    <div className="card kpi">
      <div className="card-title">{label}</div>
      <div className="stat" style={{ color }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="stat-sub">{label}</div>
      <div style={{ fontFamily: "ui-monospace, monospace" }}>{value}</div>
    </div>
  );
}

function classifyHealth(m: Measurement): Health | null {
  if (m.kind !== "latency") return null;
  const loss = m.internet_loss_pct;
  if (loss == null) return null;
  if (loss >= 0.95) return "Outage";
  if (loss > 0.05 || (m.internet_rtt_ms ?? 0) > 200 || (m.dns_ms ?? 0) > 500) return "Degraded";
  return "Healthy";
}

function buildHealthDist(series: Measurement[]) {
  let healthy = 0, degraded = 0, outage = 0;
  for (const m of series) {
    const h = classifyHealth(m);
    if (h === "Healthy") healthy++;
    else if (h === "Degraded") degraded++;
    else if (h === "Outage") outage++;
  }
  return [
    { name: "Healthy", value: healthy, color: COLOR.healthy },
    { name: "Degraded", value: degraded, color: COLOR.degraded },
    { name: "Outage", value: outage, color: COLOR.outage },
  ];
}

function pctOf(dist: { name: string; value: number }[], name: string): string {
  const total = dist.reduce((a, b) => a + b.value, 0);
  if (total === 0) return "";
  const v = dist.find((d) => d.name === name)?.value ?? 0;
  return `${((v / total) * 100).toFixed(0)}%`;
}

function buildHourlyThroughput(series: Measurement[]) {
  const buckets: Record<number, number[]> = {};
  for (const m of series) {
    if (m.kind !== "throughput" || m.down_mbps == null) continue;
    const h = new Date(m.ts).getHours();
    (buckets[h] ??= []).push(m.down_mbps);
  }
  return Array.from({ length: 24 }, (_, h) => {
    const arr = buckets[h];
    return {
      hour: `${h}:00`,
      down: arr && arr.length ? median(arr) : null,
    };
  });
}

function buildKpis(series: Measurement[], advertised: number | null) {
  const latency = series.filter((m) => m.kind === "latency");
  const throughput = series.filter((m) => m.kind === "throughput");

  const downs = throughput.map((m) => m.down_mbps).filter((x): x is number => x != null);
  const internetRtts = latency.map((m) => m.internet_rtt_ms).filter((x): x is number => x != null);
  const gatewayRtts = latency.map((m) => m.gateway_rtt_ms).filter((x): x is number => x != null);

  const medianDown = downs.length ? median(downs) : null;
  const medianInternetRtt = internetRtts.length ? median(internetRtts) : null;
  const medianGatewayRtt = gatewayRtts.length ? median(gatewayRtts) : null;

  const deliveredPct =
    medianDown != null && advertised && advertised > 0 ? (medianDown / advertised) * 100 : null;

  const healthyN = latency.filter((m) => classifyHealth(m) === "Healthy").length;
  const totalN = latency.filter((m) => classifyHealth(m) != null).length;
  const uptimePct = totalN > 0 ? (healthyN / totalN) * 100 : null;

  return { medianDown, medianInternetRtt, medianGatewayRtt, deliveredPct, healthyN, totalN, uptimePct };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fmtMbps(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toFixed(1)} Mbps`;
}

function makeTickFormatter(rangeMs: number) {
  return (ts: number | string) => {
    const d = new Date(Number(ts));
    if (rangeMs <= 24 * 60 * 60 * 1000) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (rangeMs <= 7 * 24 * 60 * 60 * 1000) {
      return d.toLocaleDateString([], { weekday: "short", hour: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "2-digit" });
  };
}

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
