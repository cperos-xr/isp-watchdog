import { useEffect, useState } from "react";
import { api, type CaseReport } from "../lib/api";

const STRENGTH_LABEL: Record<CaseReport["strength"], string> = {
  None: "No case yet",
  Weak: "Weak case",
  Moderate: "Moderate case",
  Strong: "Strong case",
  RegulatoryReady: "Regulatory-ready",
};

const STRENGTH_COLOR: Record<CaseReport["strength"], string> = {
  None: "#6b7280",
  Weak: "#f5a623",
  Moderate: "#f5a623",
  Strong: "#e84855",
  RegulatoryReady: "#e84855",
};

export default function Evidence() {
  const [report, setReport] = useState<CaseReport | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy for AI");
  const [saveLabel, setSaveLabel] = useState("Save .md");

  useEffect(() => {
    api.caseReport().then(setReport).catch(console.error);
  }, []);

  async function copyForAI() {
    try {
      const md = await api.exportMarkdown();
      await navigator.clipboard.writeText(md);
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy for AI"), 2500);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveMd() {
    try {
      const path = await api.saveMarkdownReport();
      setSaveLabel(`Saved!`);
      console.log("Saved to", path);
      setTimeout(() => setSaveLabel("Save .md"), 3000);
    } catch (e) {
      console.error(e);
    }
  }

  if (!report) return <div>Loading…</div>;

  return (
    <div>
      <div className="spaced" style={{ marginBottom: 16 }}>
        <h2>Evidence & Case Strength</h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="secondary" onClick={copyForAI}>{copyLabel}</button>
          <button className="secondary" onClick={saveMd}>{saveLabel}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Case strength (last {report.window_days} days)</div>
        <div className="row" style={{ gap: 16 }}>
          <div className="stat" style={{ color: STRENGTH_COLOR[report.strength] }}>
            {STRENGTH_LABEL[report.strength]}
          </div>
          <div className="stat-sub">score: {report.score}</div>
        </div>
      </div>

      <div className="grid">
        <Summary label="Median download" value={fmtMbps(report.summary.median_down_mbps)} sub={`advertised: ${fmtMbps(report.summary.advertised_down)}`} />
        <Summary label="Median upload" value={fmtMbps(report.summary.median_up_mbps)} />
        <Summary label="Outages" value={`${report.summary.outage_count}`} sub={`${report.summary.outage_total_secs}s total`} />
        <Summary label="Internet RTT" value={fmtMs(report.summary.median_internet_rtt_ms)} />
        <Summary label="Gateway RTT" value={fmtMs(report.summary.median_gateway_rtt_ms)} />
        <Summary label="Packet loss" value={fmtPct(report.summary.mean_internet_loss_pct)} />
      </div>

      <div className="card">
        <div className="card-title">Findings</div>
        <ul className="findings" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {report.findings.map((f) => (
            <li key={f.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong style={{ color: f.hit ? "#e84855" : "#36c98a" }}>
                    {f.hit ? "✗" : "✓"}
                  </strong>{" "}
                  {f.title}
                  <span className={`severity ${f.severity}`}>{f.severity}</span>
                </div>
              </div>
              <div className="stat-sub" style={{ marginTop: 4 }}>{f.detail}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Summary({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="card-title">{label}</div>
      <div className="stat">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
function fmtMbps(n?: number | null) { return n == null ? "—" : `${n.toFixed(1)} Mbps`; }
function fmtMs(n?: number | null) { return n == null ? "—" : `${n.toFixed(1)} ms`; }
function fmtPct(n?: number | null) { return n == null ? "—" : `${(n * 100).toFixed(2)}%`; }
