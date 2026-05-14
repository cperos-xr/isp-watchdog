import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, type EmailDraft, type IspEntry } from "../lib/api";

const TIERS: { key: string; label: string; description: string }[] = [
  {
    key: "first_contact",
    label: "First contact",
    description: "Polite, asks for resolution. Use this first.",
  },
  {
    key: "formal_complaint",
    label: "Formal complaint",
    description: "Cites contract clauses, demands credit. Use when first contact fails.",
  },
  {
    key: "regulator",
    label: "FCC complaint (US)",
    description: "Ready-to-paste content for the FCC consumer complaint form.",
  },
  {
    key: "legal_notice",
    label: "Pre-litigation notice",
    description: "Demand letter. NOT legal advice — review with a lawyer.",
  },
];

export default function Templates() {
  const [tier, setTier] = useState("first_contact");
  const [to, setTo] = useState("");
  const [catalog, setCatalog] = useState<IspEntry[]>([]);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.ispCatalog().then(setCatalog).catch(console.error);
  }, []);

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      const d = await api.draftEmail(tier, to || "[support@your-isp.com]");
      setDraft(d);
    } catch (e: unknown) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openInMailClient() {
    if (!draft) return;
    const url = await api.buildMailto(draft);
    await openUrl(url);
  }

  async function openFcc() {
    const url = await api.fccUrl();
    await openUrl(url);
  }

  return (
    <div>
      <h2>Complaint Drafts</h2>

      <div className="card">
        <div className="card-title">1. Pick a tier</div>
        <div className="grid">
          {TIERS.map((t) => (
            <div
              key={t.key}
              className="card"
              style={{
                cursor: "pointer",
                margin: 0,
                borderColor: tier === t.key ? "#4f8cff" : undefined,
              }}
              onClick={() => setTier(t.key)}
            >
              <strong>{t.label}</strong>
              <div className="stat-sub" style={{ marginTop: 4 }}>{t.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">2. Recipient</div>
        <label>Send to</label>
        <input
          style={{ width: "100%" }}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="support@your-isp.com"
        />
        {catalog.length > 0 && (
          <div className="stat-sub" style={{ marginTop: 8 }}>
            Catalog tips:
            <ul style={{ marginTop: 4 }}>
              {catalog.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong>: {c.support_phone ?? "no phone"}{" "}
                  {c.complaint_form_url ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); openUrl(c.complaint_form_url!); }}>contact</a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button onClick={generate} disabled={busy}>
          {busy ? "Drafting…" : "Generate draft"}
        </button>
        {tier === "regulator" && (
          <button className="secondary" onClick={openFcc}>Open FCC form</button>
        )}
      </div>
      {err && <div className="card" style={{ borderColor: "#e84855", marginTop: 12 }}>{err}</div>}

      {draft && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Draft</div>
          <label>To</label>
          <input style={{ width: "100%" }} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          <label>Subject</label>
          <input style={{ width: "100%" }} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          <label>Body</label>
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button onClick={openInMailClient}>Open in mail client</button>
            <button className="secondary" onClick={() => navigator.clipboard.writeText(draft.body)}>
              Copy body
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
