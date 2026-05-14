import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { DONATE_ENTRIES, DONATE_MESSAGE, type DonateEntry } from "../lib/donate";

export default function Donate() {
  const visible = DONATE_ENTRIES.filter((e) => e.value && !e.value.startsWith("["));
  const placeholders = DONATE_ENTRIES.filter((e) => !e.value || e.value.startsWith("["));

  return (
    <div>
      <h2>Support development</h2>

      <div className="card">
        <div className="card-title">Why</div>
        <div>{DONATE_MESSAGE}</div>
      </div>

      {visible.length > 0 && (
        <div className="card">
          <div className="card-title">Donation options</div>
          {visible.map((e, i) => (
            <DonateRow key={i} entry={e} />
          ))}
        </div>
      )}

      {placeholders.length > 0 && (
        <div className="card">
          <div className="card-title">Not configured yet</div>
          <div className="stat-sub">
            The developer hasn't filled in these destinations yet. Edit{" "}
            <code>src/lib/donate.ts</code> in the repo to enable them.
          </div>
          <ul style={{ marginTop: 8, color: "var(--muted)" }}>
            {placeholders.map((p, i) => (
              <li key={i}>{p.label}{p.network ? ` (${p.network})` : ""}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DonateRow({ entry }: { entry: DonateEntry }) {
  const [copied, setCopied] = useState(false);

  async function open() {
    await openUrl(entry.value);
  }
  async function copy() {
    await navigator.clipboard.writeText(entry.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid var(--panel-border)",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong>{entry.label}</strong>
        {entry.network && (
          <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 12 }}>
            {entry.network}
          </span>
        )}
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            color: "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.value}
        </div>
        {entry.note && <div className="stat-sub">{entry.note}</div>}
      </div>
      <div className="row" style={{ gap: 6 }}>
        {entry.kind === "link" && (
          <button onClick={open}>Open</button>
        )}
        <button className="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
