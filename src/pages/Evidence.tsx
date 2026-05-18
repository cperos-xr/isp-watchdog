import { useEffect, useState } from "react";
import {
  api,
  DEFAULT_POLLINATIONS_MODEL,
  summarizePollinationsAccount,
  type CaseReport,
  type PollinationsAccountSnapshot,
} from "../lib/api";

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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [pollinationsConfigured, setPollinationsConfigured] = useState<boolean | null>(null);
  const [pollinationsModel, setPollinationsModel] = useState(DEFAULT_POLLINATIONS_MODEL);
  const [pollinationsSnapshot, setPollinationsSnapshot] = useState<PollinationsAccountSnapshot | null>(null);
  const [pollinationsLoading, setPollinationsLoading] = useState(false);
  const [pollinationsError, setPollinationsError] = useState("");
  const pollinationsSummary = summarizePollinationsAccount(pollinationsSnapshot);

  useEffect(() => {
    api.caseReport().then(setReport).catch(console.error);
    Promise.all([api.pollinationsGetKey(), api.pollinationsGetModel()])
      .then(([key, model]) => {
        setPollinationsConfigured(Boolean(key));
        if (model) setPollinationsModel(model);
        if (key) void refreshPollinationsAccount();
      })
      .catch(console.error);
  }, []);

  async function refreshPollinationsAccount() {
    try {
      setPollinationsLoading(true);
      setPollinationsError("");
      const snapshot = await api.pollinationsAccountSnapshot();
      setPollinationsSnapshot(snapshot);
    } catch (error) {
      setPollinationsSnapshot(null);
      setPollinationsError(String(error));
    } finally {
      setPollinationsLoading(false);
    }
  }

  function estimateRequestCost(short: boolean) {
    if (short) return pollinationsSummary.recentAverageCost;
    return pollinationsSummary.recentMaxCost ?? pollinationsSummary.recentAverageCost;
  }

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

  async function generateAi(short: boolean) {
    const estimate = estimateRequestCost(short);
    if (pollinationsSummary.balance != null && estimate != null && pollinationsSummary.balance < estimate) {
      setAiResult("Pollinations balance looks below the recent cost for this action. Refill or wait before retrying.");
      return;
    }

    const confirmation = [
      `Call Pollinations with ${pollinationsModel || DEFAULT_POLLINATIONS_MODEL}?`,
      pollinationsSummary.balance != null
        ? `Current balance: ${formatPollen(pollinationsSummary.balance)}`
        : "Balance unavailable for this key.",
      estimate != null
        ? `Recent estimated request cost: ${formatPollen(estimate)}`
        : "Exact cost varies by model and output length.",
    ].join("\n");
    if (!confirm(confirmation)) return;

    try {
      setAiLoading(true);
      setAiResult(null);
      const md = await api.exportMarkdown();
      const prompt = `Analyze the following ISP Watchdog evidence report and produce a ${short ? 'short summary' : 'formal complaint letter and suggested email body'}.\n\n${md}`;
      const out = await api.pollinationsGenerate(prompt, null, short);
      setAiResult(out);
      await refreshPollinationsAccount();
    } catch (e) {
      console.error(e);
      setAiResult('Error: ' + String(e));
    } finally {
      setAiLoading(false);
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
          <button className="secondary" onClick={() => generateAi(true)} disabled={aiLoading || pollinationsConfigured === false}>{aiLoading ? 'Generating…' : 'AI: Short summary'}</button>
          <button onClick={() => generateAi(false)} disabled={aiLoading || pollinationsConfigured === false}>{aiLoading ? 'Generating…' : 'AI: Full letter'}</button>
        </div>
      </div>

      <div className="card">
        <div className="spaced" style={{ marginBottom: 8 }}>
          <div className="card-title">Pollinations usage</div>
          <button className="secondary" onClick={() => void refreshPollinationsAccount()} disabled={pollinationsLoading || pollinationsConfigured !== true}>
            {pollinationsLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {pollinationsConfigured === false ? (
          <div className="stat-sub">Add a Pollinations key in Settings before using in-app AI actions.</div>
        ) : (
          <>
            <div className="grid">
              <Summary label="Model" value={pollinationsModel || DEFAULT_POLLINATIONS_MODEL} />
              <Summary label="Balance" value={formatPollen(pollinationsSummary.balance)} />
              <Summary label="Today" value={formatPollen(pollinationsSummary.todaySpend)} sub={pollinationsSummary.todayRequests != null ? `${pollinationsSummary.todayRequests} requests` : "Request count unavailable"} />
              <Summary label="Next estimate" value={formatPollen(pollinationsSummary.recentAverageCost)} sub="Based on recent private usage." />
            </div>

            {pollinationsError && (
              <div className="stat-sub" style={{ color: "#f5a623", marginTop: 8 }}>
                {pollinationsError}
              </div>
            )}
            {pollinationsSummary.warnings.map((warning, index) => (
              <div key={`${warning}-${index}`} className="stat-sub" style={{ color: "#f5a623", marginTop: 6 }}>
                {warning}
              </div>
            ))}
          </>
        )}
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

      {aiResult && (
        <div className="card">
          <div className="card-title">AI Output</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{aiResult}</pre>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => navigator.clipboard.writeText(aiResult)}>Copy AI output</button>
          </div>
        </div>
      )}
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
function formatPollen(n?: number | null) { return n == null ? "—" : `${n.toFixed(2)} pollen`; }
