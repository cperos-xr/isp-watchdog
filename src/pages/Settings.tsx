import { useEffect, useState } from "react";
import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";
import { api, type Equipment, type IspEntry, type Plan, type Thresholds } from "../lib/api";

export default function Settings() {
  const [catalog, setCatalog] = useState<IspEntry[]>([]);
  const [plan, setPlan] = useState<Partial<Plan>>({
    isp: "Spectrum (Charter)",
    plan_name: "",
    advertised_down: 300,
    advertised_up: 20,
    monthly_cost_cents: 0,
    currency: "USD",
  });
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [saved, setSaved] = useState("");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [pollinationsKey, setPollinationsKey] = useState("");
  const [deviceClientId, setDeviceClientId] = useState("");
  const [deviceUserCode, setDeviceUserCode] = useState<string | null>(null);
  const [deviceVerificationUri, setDeviceVerificationUri] = useState<string | null>(null);
  const [devicePolling, setDevicePolling] = useState(false);
  const [devicePollTimer, setDevicePollTimer] = useState<number | null>(null);

  useEffect(() => {
    api.ispCatalog().then(setCatalog).catch(console.error);
    api.getActivePlan().then((p) => p && setPlan(p)).catch(console.error);
    api.getThresholds().then(setThresholds).catch(console.error);
    api.listEquipment().then(setEquipment).catch(console.error);
    isEnabled().then(setAutostart).catch(console.error);
    api.pollinationsGetKey().then((k) => k && setPollinationsKey(k)).catch(console.error);
  }, []);

  useEffect(() => {
    return () => {
      if (devicePollTimer) window.clearInterval(devicePollTimer);
    };
  }, [devicePollTimer]);

  async function savePlan() {
    await api.savePlan({
      isp: plan.isp ?? "",
      plan_name: plan.plan_name ?? "",
      advertised_down: Number(plan.advertised_down ?? 0),
      advertised_up: Number(plan.advertised_up ?? 0),
      monthly_cost_cents: Number(plan.monthly_cost_cents ?? 0) || null,
      currency: plan.currency ?? "USD",
      contract_start: plan.contract_start ?? null,
      source: "manual",
    });
    flash("Plan saved");
  }
  async function saveThresholds() {
    if (!thresholds) return;
    await api.saveThresholds(thresholds);
    flash("Thresholds saved");
  }
  async function savePersonal() {
    await api.savePersonal({ customer_name: customerName, account_number: accountNumber });
    flash("Personal info saved");
  }
  async function saveEquipment() {
    await api.saveEquipment(equipment);
    flash("Equipment saved");
  }
  function addEquipment(role: Equipment["role"]) {
    setEquipment([
      ...equipment,
      { role, ownership: "unknown" } as Equipment,
    ]);
  }
  function updateEquipment(idx: number, patch: Partial<Equipment>) {
    setEquipment(equipment.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function removeEquipment(idx: number) {
    setEquipment(equipment.filter((_, i) => i !== idx));
  }
  async function toggleAutostart() {
    if (autostart) await disable();
    else await enable();
    const v = await isEnabled();
    setAutostart(v);
  }
  function flash(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(""), 1500);
  }

  return (
    <div>
      <div className="spaced">
        <h2>Settings</h2>
        {saved && <span style={{ color: "#36c98a", fontSize: 13 }}>{saved}</span>}
      </div>

      <div className="card">
        <div className="card-title">Your plan</div>
        <div className="grid">
          <div>
            <label>ISP</label>
            <select value={plan.isp ?? ""} onChange={(e) => setPlan({ ...plan, isp: e.target.value })} style={{ width: "100%" }}>
              {catalog.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Plan name</label>
            <input style={{ width: "100%" }} value={plan.plan_name ?? ""} onChange={(e) => setPlan({ ...plan, plan_name: e.target.value })} placeholder="e.g. Internet Ultra" />
          </div>
          <div>
            <label>Advertised download (Mbps)</label>
            <input type="number" style={{ width: "100%" }} value={plan.advertised_down ?? 0} onChange={(e) => setPlan({ ...plan, advertised_down: Number(e.target.value) })} />
          </div>
          <div>
            <label>Advertised upload (Mbps)</label>
            <input type="number" style={{ width: "100%" }} value={plan.advertised_up ?? 0} onChange={(e) => setPlan({ ...plan, advertised_up: Number(e.target.value) })} />
          </div>
          <div>
            <label>Monthly cost (cents)</label>
            <input type="number" style={{ width: "100%" }} value={plan.monthly_cost_cents ?? 0} onChange={(e) => setPlan({ ...plan, monthly_cost_cents: Number(e.target.value) })} />
          </div>
          <div>
            <label>Currency</label>
            <input style={{ width: "100%" }} value={plan.currency ?? "USD"} onChange={(e) => setPlan({ ...plan, currency: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={savePlan}>Save plan</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Your equipment</div>
        <div className="stat-sub" style={{ marginBottom: 12 }}>
          Documenting the modem/router rules out the "blame your hardware" deflection.
          Enter at least the modem; vendor + model + DOCSIS version is enough.
          Your wired link speed is already auto-detected on every probe.
        </div>
        {equipment.map((eq, idx) => (
          <div key={idx} className="card" style={{ background: "#0c0f14", marginBottom: 8 }}>
            <div className="grid">
              <div>
                <label>Role</label>
                <select
                  style={{ width: "100%" }}
                  value={eq.role}
                  onChange={(e) => updateEquipment(idx, { role: e.target.value as Equipment["role"] })}
                >
                  <option value="modem">Modem</option>
                  <option value="router">Router</option>
                  <option value="gateway">Gateway (combined)</option>
                  <option value="switch">Switch</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label>Ownership</label>
                <select
                  style={{ width: "100%" }}
                  value={eq.ownership}
                  onChange={(e) => updateEquipment(idx, { ownership: e.target.value as Equipment["ownership"] })}
                >
                  <option value="unknown">Unknown</option>
                  <option value="rented">Rented from ISP</option>
                  <option value="owned">Owned</option>
                </select>
              </div>
              <div>
                <label>Vendor</label>
                <input
                  style={{ width: "100%" }}
                  value={eq.vendor ?? ""}
                  onChange={(e) => updateEquipment(idx, { vendor: e.target.value })}
                  placeholder="e.g. Arris, Netgear"
                />
              </div>
              <div>
                <label>Model</label>
                <input
                  style={{ width: "100%" }}
                  value={eq.model ?? ""}
                  onChange={(e) => updateEquipment(idx, { model: e.target.value })}
                  placeholder="e.g. SB8200"
                />
              </div>
              <div>
                <label>Firmware</label>
                <input
                  style={{ width: "100%" }}
                  value={eq.firmware ?? ""}
                  onChange={(e) => updateEquipment(idx, { firmware: e.target.value })}
                />
              </div>
              <div>
                <label>DOCSIS version (modems only)</label>
                <input
                  style={{ width: "100%" }}
                  value={eq.docsis_version ?? ""}
                  onChange={(e) => updateEquipment(idx, { docsis_version: e.target.value })}
                  placeholder="3.0 or 3.1"
                />
              </div>
              <div>
                <label>Vendor max down (Mbps)</label>
                <input
                  type="number"
                  style={{ width: "100%" }}
                  value={eq.max_down_mbps ?? 0}
                  onChange={(e) => updateEquipment(idx, { max_down_mbps: Number(e.target.value) || null })}
                />
              </div>
              <div>
                <label>Vendor max up (Mbps)</label>
                <input
                  type="number"
                  style={{ width: "100%" }}
                  value={eq.max_up_mbps ?? 0}
                  onChange={(e) => updateEquipment(idx, { max_up_mbps: Number(e.target.value) || null })}
                />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="secondary" onClick={() => removeEquipment(idx)}>Remove</button>
            </div>
          </div>
        ))}
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="secondary" onClick={() => addEquipment("modem")}>+ Modem</button>
          <button className="secondary" onClick={() => addEquipment("router")}>+ Router</button>
          <button className="secondary" onClick={() => addEquipment("gateway")}>+ Gateway</button>
          <button onClick={saveEquipment}>Save equipment</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Personal info (for email templates)</div>
        <div className="grid">
          <div>
            <label>Your name</label>
            <input style={{ width: "100%" }} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label>Account number</label>
            <input style={{ width: "100%" }} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={savePersonal}>Save personal info</button>
        </div>
      </div>

      {thresholds && (
        <div className="card">
          <div className="card-title">Thresholds (advanced)</div>
          <div className="grid">
            <NumField label="Window (days)" v={thresholds.window_days} on={(v) => setThresholds({ ...thresholds, window_days: v })} />
            <NumField label="Median down ratio" v={thresholds.min_down_ratio_median} step={0.05} on={(v) => setThresholds({ ...thresholds, min_down_ratio_median: v })} />
            <NumField label="Bad probe ratio" v={thresholds.bad_probe_ratio} step={0.05} on={(v) => setThresholds({ ...thresholds, bad_probe_ratio: v })} />
            <NumField label="Bad probe threshold" v={thresholds.bad_probe_threshold} step={0.05} on={(v) => setThresholds({ ...thresholds, bad_probe_threshold: v })} />
            <NumField label="Min outages for hit" v={thresholds.min_outages_for_hit} on={(v) => setThresholds({ ...thresholds, min_outages_for_hit: v })} />
            <NumField label="Outage duration (secs)" v={thresholds.outage_duration_secs} on={(v) => setThresholds({ ...thresholds, outage_duration_secs: v })} />
            <NumField label="High internet RTT (ms)" v={thresholds.high_internet_rtt_ms} on={(v) => setThresholds({ ...thresholds, high_internet_rtt_ms: v })} />
            <NumField label="Healthy gateway RTT (ms)" v={thresholds.healthy_gateway_rtt_ms} on={(v) => setThresholds({ ...thresholds, healthy_gateway_rtt_ms: v })} />
            <NumField label="High packet loss (fraction)" v={thresholds.high_packet_loss_pct} step={0.01} on={(v) => setThresholds({ ...thresholds, high_packet_loss_pct: v })} />
            <NumField label="High DNS p95 (ms)" v={thresholds.high_dns_p95_ms} on={(v) => setThresholds({ ...thresholds, high_dns_p95_ms: v })} />
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={saveThresholds}>Save thresholds</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">AI Integrations</div>
        <div className="grid">
          <div>
            <label>Pollinations API key (secret)</label>
            <input style={{ width: "100%" }} value={pollinationsKey} onChange={(e) => setPollinationsKey(e.target.value)} placeholder="sk_... (your Pollinations key)" />
            <div className="stat-sub" style={{ marginTop: 6 }}>
              Paste your Pollinations secret key here (sk_...). See <a href="https://enter.pollinations.ai" target="_blank" rel="noreferrer">enter.pollinations.ai</a> for API keys and BYOP instructions.
            </div>
            <div style={{ marginTop: 8 }}>
              <button onClick={async () => {
                try {
                  await api.pollinationsSaveKey(pollinationsKey || null);
                  flash('Pollinations key saved');
                } catch (e) {
                  console.error(e);
                }
              }}>Save Pollinations key</button>
            </div>
          </div>

          <div>
            <label>Or: connect via App Key (client)</label>
            <input style={{ width: "100%" }} value={deviceClientId} onChange={(e) => setDeviceClientId(e.target.value)} placeholder="pk_... (your App Key for attribution)" />
            <div className="stat-sub" style={{ marginTop: 6 }}>
              Use an App Key (`pk_...`) to start a device login flow and authorize this app to spend your Pollen.
            </div>
            <div style={{ marginTop: 8 }}>
              <button onClick={async () => {
                try {
                  const res: any = await api.pollinationsDeviceStart(deviceClientId || null);
                  const uri = res.verification_uri_complete || res.verification_uri;
                  // store device code internally if needed
                  setDeviceUserCode(res.user_code || null);
                  setDeviceVerificationUri(uri || null);
                  // open browser to verification URL
                  window.open(uri, '_blank');
                  // start polling
                  const interval = (res.interval || 5) * 1000;
                  let pollId: any = window.setInterval(async () => {
                    try {
                      const token: any = await api.pollinationsDevicePoll(res.device_code);
                      if (token) {
                        await api.pollinationsSaveKey(token);
                        setPollinationsKey(token);
                        flash('Pollinations key saved');
                        window.clearInterval(pollId);
                        setDevicePolling(false);
                        setDevicePollTimer(null);
                        
                        setDeviceUserCode(null);
                        setDeviceVerificationUri(null);
                      }
                    } catch (err: any) {
                      const msg = String(err);
                      if (msg.includes('authorization_pending') || msg.includes('slow_down')) {
                        return;
                      }
                      console.error(err);
                      window.clearInterval(pollId);
                      setDevicePolling(false);
                      setDevicePollTimer(null);
                      flash('Device login failed');
                    }
                  }, interval);
                  setDevicePollTimer(pollId as unknown as number);
                  setDevicePolling(true);
                } catch (e) {
                  console.error(e);
                  flash('Device login failed');
                }
              }}>Start device login</button>
              {devicePolling && <button style={{ marginLeft: 8 }} onClick={() => {
                if (devicePollTimer) { window.clearInterval(devicePollTimer); setDevicePollTimer(null); setDevicePolling(false); }
              }}>Cancel</button>}
            </div>

            {deviceUserCode && (
              <div style={{ marginTop: 8 }}>
                <div><strong>Enter code:</strong> {deviceUserCode}</div>
                <div className="stat-sub">If your browser didn't open, go to <a href={deviceVerificationUri ?? '#'} target="_blank" rel="noreferrer">{deviceVerificationUri}</a> and enter the code above.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Startup</div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>Launch on system startup</strong>
            <div className="stat-sub">Probes need to be running to collect evidence. Off by default.</div>
          </div>
          <button className={autostart ? "" : "secondary"} onClick={toggleAutostart}>
            {autostart ? "Enabled" : "Disabled"}
          </button>
        </div>
      </div>
    </div>

  );
}

function NumField({ label, v, on, step }: { label: string; v: number; on: (n: number) => void; step?: number }) {
  return (
    <div>
      <label>{label}</label>
      <input
        type="number"
        step={step ?? 1}
        style={{ width: "100%" }}
        value={v}
        onChange={(e) => on(Number(e.target.value))}
      />
    </div>
  );
}
