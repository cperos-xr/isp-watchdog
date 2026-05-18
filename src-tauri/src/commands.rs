//! Tauri command surface exposed to the React frontend.

use anyhow::Context as _;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use crate::contracts::{catalog, fcc_complaint_url, IspEntry};
use crate::db::repo::{self, Equipment, EventRecord, Measurement, Plan};
use crate::db::DbPool;
use crate::evidence::{score_case, CaseReport, CaseStrength, Thresholds};
use crate::mail::templates::{render, suggested_credit, TemplateContext, Tier};
use crate::mail::{mailto_url, EmailDraft};
use crate::scheduler::HealthState;
use crate::AppState;

const SETTING_THRESHOLDS: &str = "thresholds_json";
const SETTING_CUSTOMER_NAME: &str = "customer_name";
const SETTING_ACCOUNT_NUMBER: &str = "account_number";
const SETTING_POLLINATIONS_KEY: &str = "pollinations_api_key";

#[derive(Serialize)]
pub struct DashboardSnapshot {
    pub state: HealthState,
    pub last_measurement: Option<Measurement>,
    pub plan: Option<Plan>,
}

fn load_thresholds(pool: &DbPool) -> anyhow::Result<Thresholds> {
    match repo::get_setting(pool, SETTING_THRESHOLDS)? {
        Some(s) => Ok(serde_json::from_str(&s)?),
        None => Ok(Thresholds::default()),
    }
}

fn build_case_report(pool: &DbPool) -> anyhow::Result<CaseReport> {
    let thresholds = load_thresholds(pool)?;
    let now = Utc::now().timestamp_millis();
    let since = now - thresholds.window_days as i64 * 24 * 60 * 60 * 1000;
    let measurements = repo::measurements_since(pool, since)?;
    let events = repo::events_since(pool, since)?;
    let plan = repo::active_plan(pool)?;
    Ok(score_case(&measurements, &events, plan.as_ref(), &thresholds))
}

#[tauri::command]
pub fn dashboard_snapshot(state: State<'_, AppState>) -> Result<DashboardSnapshot, String> {
    let now = Utc::now().timestamp_millis();
    let since = now - 24 * 60 * 60 * 1000;
    let mut measurements =
        repo::measurements_since(&state.pool, since).map_err(|e| e.to_string())?;
    let last = measurements.pop();
    let plan = repo::active_plan(&state.pool).map_err(|e| e.to_string())?;
    let state_now = *state.scheduler.state_rx.borrow();
    Ok(DashboardSnapshot {
        state: state_now,
        last_measurement: last,
        plan,
    })
}

#[tauri::command]
pub fn list_measurements(
    state: State<'_, AppState>,
    since_ts: i64,
) -> Result<Vec<Measurement>, String> {
    repo::measurements_since(&state.pool, since_ts).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_events(state: State<'_, AppState>, since_ts: i64) -> Result<Vec<EventRecord>, String> {
    repo::events_since(&state.pool, since_ts).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct PlanInput {
    pub isp: String,
    pub plan_name: String,
    pub advertised_down: f64,
    pub advertised_up: f64,
    pub monthly_cost_cents: Option<i64>,
    pub currency: Option<String>,
    pub contract_start: Option<i64>,
    pub source: Option<String>,
}

#[tauri::command]
pub fn save_plan(state: State<'_, AppState>, plan: PlanInput) -> Result<i64, String> {
    let p = Plan {
        id: None,
        isp: plan.isp,
        plan_name: plan.plan_name,
        advertised_down: plan.advertised_down,
        advertised_up: plan.advertised_up,
        monthly_cost_cents: plan.monthly_cost_cents,
        currency: plan.currency,
        contract_start: plan.contract_start,
        source: plan.source.unwrap_or_else(|| "manual".into()),
        active: true,
    };
    repo::upsert_plan(&state.pool, &p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_active_plan(state: State<'_, AppState>) -> Result<Option<Plan>, String> {
    repo::active_plan(&state.pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_thresholds(state: State<'_, AppState>) -> Result<Thresholds, String> {
    load_thresholds(&state.pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_thresholds(state: State<'_, AppState>, thresholds: Thresholds) -> Result<(), String> {
    let s = serde_json::to_string(&thresholds).map_err(|e| e.to_string())?;
    repo::set_setting(&state.pool, SETTING_THRESHOLDS, &s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn case_report(state: State<'_, AppState>) -> Result<CaseReport, String> {
    build_case_report(&state.pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn isp_catalog() -> Vec<IspEntry> {
    catalog()
}

#[tauri::command]
pub fn fcc_url() -> String {
    fcc_complaint_url().to_string()
}

#[derive(Deserialize)]
pub struct DraftEmailRequest {
    pub tier: String,
    pub to: String,
}

#[tauri::command]
pub fn draft_email(
    state: State<'_, AppState>,
    req: DraftEmailRequest,
) -> Result<EmailDraft, String> {
    let report = build_case_report(&state.pool).map_err(|e| e.to_string())?;
    let plan = repo::active_plan(&state.pool)
        .map_err(|e| e.to_string())?
        .ok_or("no active plan configured")?;
    let customer_name = repo::get_setting(&state.pool, SETTING_CUSTOMER_NAME)
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "[YOUR NAME]".to_string());
    let account_number =
        repo::get_setting(&state.pool, SETTING_ACCOUNT_NUMBER).map_err(|e| e.to_string())?;
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let monthly_cost = plan.monthly_cost_cents.map(|c| c as f64 / 100.0);
    let requested_credit = monthly_cost.and_then(|c| suggested_credit(&report, c, 1));
    let equipment = repo::list_equipment(&state.pool).map_err(|e| e.to_string())?;

    let ctx = TemplateContext {
        customer_name,
        account_number,
        isp_name: plan.isp.clone(),
        support_email: None,
        plan_name: plan.plan_name.clone(),
        advertised_down: plan.advertised_down,
        advertised_up: plan.advertised_up,
        monthly_cost,
        currency: plan.currency.clone().unwrap_or_else(|| "USD".into()),
        report,
        today,
        requested_credit,
        equipment,
    };

    let tier = match req.tier.as_str() {
        "first_contact" => Tier::FirstContact,
        "formal_complaint" => Tier::FormalComplaint,
        "regulator" => Tier::Regulator,
        "legal_notice" => Tier::LegalNotice,
        other => return Err(format!("unknown tier: {other}")),
    };

    let body = render(tier, &ctx)
        .with_context(|| "render template")
        .map_err(|e| e.to_string())?;
    let (subject, body) = split_subject(&body);

    Ok(EmailDraft {
        template: tier.key().to_string(),
        to: req.to,
        subject,
        body,
    })
}

#[tauri::command]
pub fn build_mailto(draft: EmailDraft) -> String {
    mailto_url(&draft)
}

fn split_subject(rendered: &str) -> (String, String) {
    let mut lines = rendered.lines();
    if let Some(first) = lines.next() {
        if let Some(rest) = first.strip_prefix("Subject:") {
            let body = lines.collect::<Vec<_>>().join("\n");
            return (
                rest.trim().to_string(),
                body.trim_start_matches('\n').to_string(),
            );
        }
    }
    ("ISP service complaint".to_string(), rendered.to_string())
}

#[tauri::command]
pub fn run_throughput_now(state: State<'_, AppState>) -> Result<String, String> {
    let pool = state.pool.clone();
    tauri::async_runtime::spawn(async move {
        let adapter = crate::probes::adapter::probe();
        let result = match crate::probes::throughput::run(
            crate::probes::throughput::DEFAULT_DOWN_BYTES * 4,
            crate::probes::throughput::DEFAULT_UP_BYTES * 4,
        )
        .await
        {
            Ok(r) => r,
            Err(e) => {
                log::warn!("manual throughput probe failed: {e:?}");
                return;
            }
        };
        let pub_info = crate::probes::dns::fetch_public_info().await;
        let m = Measurement {
            id: None,
            ts: Utc::now().timestamp_millis(),
            kind: "throughput".into(),
            gateway_ip: adapter.gateway_ip,
            gateway_mac: adapter.gateway_mac,
            ssid: adapter.ssid,
            link_type: adapter.link_type,
            link_speed_mbps: adapter.link_speed_mbps,
            gateway_rtt_ms: None,
            gateway_loss_pct: None,
            internet_rtt_ms: None,
            internet_loss_pct: None,
            dns_ms: None,
            down_mbps: result.down_mbps,
            up_mbps: result.up_mbps,
            public_ip: pub_info.ip,
            asn: pub_info.asn,
            asn_org: pub_info.asn_org,
        };
        let _ = repo::insert_measurement(&pool, &m);
    });
    Ok("ok".into())
}

#[derive(Deserialize)]
pub struct PersonalInput {
    pub customer_name: Option<String>,
    pub account_number: Option<String>,
}

#[tauri::command]
pub fn list_equipment(state: State<'_, AppState>) -> Result<Vec<Equipment>, String> {
    repo::list_equipment(&state.pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_equipment(
    state: State<'_, AppState>,
    items: Vec<Equipment>,
) -> Result<(), String> {
    repo::replace_equipment(&state.pool, &items).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn export_markdown(state: State<'_, AppState>) -> Result<String, String> {
    let report = build_case_report(&state.pool).map_err(|e| e.to_string())?;
    let plan = repo::active_plan(&state.pool).map_err(|e| e.to_string())?;
    Ok(render_markdown(&report, plan.as_ref()))
}

#[tauri::command]
pub fn save_markdown_report(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let md = render_markdown(
        &build_case_report(&state.pool).map_err(|e| e.to_string())?,
        repo::active_plan(&state.pool).map_err(|e| e.to_string())?.as_ref(),
    );
    let date = Utc::now().format("%Y-%m-%d");
    let docs = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?;
    let path = docs.join(format!("isp-watchdog-{date}.md"));
    std::fs::write(&path, md).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn render_markdown(report: &CaseReport, plan: Option<&Plan>) -> String {
    use std::fmt::Write;
    let mut out = String::new();
    let today = Utc::now().format("%Y-%m-%d");

    let strength_note = match report.strength {
        CaseStrength::None => "No significant issues detected in this window.",
        CaseStrength::Weak => "Minor issues detected. Keep monitoring.",
        CaseStrength::Moderate => "Moderate evidence of underdelivery. Consider a polite complaint.",
        CaseStrength::Strong => "Strong evidence. Suitable for a formal complaint.",
        CaseStrength::RegulatoryReady => "Very strong evidence. Suitable for FCC/regulator filing.",
    };

    let _ = writeln!(out, "# ISP Watchdog Evidence Report");
    let _ = writeln!(out);
    let _ = writeln!(out, "**Generated:** {today}");
    if let Some(p) = plan {
        let _ = writeln!(out, "**ISP:** {}", p.isp);
        let _ = writeln!(out, "**Plan:** {} ({} / {} Mbps advertised)", p.plan_name, p.advertised_down, p.advertised_up);
        if let Some(cost) = p.monthly_cost_cents {
            let _ = writeln!(out, "**Monthly cost:** ${:.2}", cost as f64 / 100.0);
        }
    }
    let _ = writeln!(out, "**Analysis window:** {} days", report.window_days);
    let _ = writeln!(out);
    let _ = writeln!(out, "---");
    let _ = writeln!(out);
    let _ = writeln!(out, "## Case Strength: {:?} (score {}/12)", report.strength, report.score);
    let _ = writeln!(out);
    let _ = writeln!(out, "> {strength_note}");
    let _ = writeln!(out);
    let _ = writeln!(out, "---");
    let _ = writeln!(out);
    let _ = writeln!(out, "## Summary Statistics");
    let _ = writeln!(out);
    let _ = writeln!(out, "| Metric | Value | Advertised |");
    let _ = writeln!(out, "|---|---|---|");

    let s = &report.summary;
    let adv = s.advertised_down.map(|v| format!("{v:.1} Mbps")).unwrap_or_else(|| "—".into());
    let _ = writeln!(out, "| Download speed (median) | {} | {adv} |",
        s.median_down_mbps.map(|v| format!("{v:.1} Mbps")).unwrap_or_else(|| "—".into()));
    let _ = writeln!(out, "| Upload speed (median) | {} | — |",
        s.median_up_mbps.map(|v| format!("{v:.1} Mbps")).unwrap_or_else(|| "—".into()));

    if let (Some(down), Some(adv_v)) = (s.median_down_mbps, s.advertised_down) {
        if adv_v > 0.0 {
            let _ = writeln!(out, "| Speed delivered | {:.1}% of advertised | 100% |", (down / adv_v) * 100.0);
        }
    }

    let _ = writeln!(out, "| Internet RTT (median) | {} | — |",
        s.median_internet_rtt_ms.map(|v| format!("{v:.1} ms")).unwrap_or_else(|| "—".into()));
    let _ = writeln!(out, "| Gateway RTT (median) | {} | — |",
        s.median_gateway_rtt_ms.map(|v| format!("{v:.1} ms")).unwrap_or_else(|| "—".into()));
    let _ = writeln!(out, "| Packet loss (mean) | {} | 0% |",
        s.mean_internet_loss_pct.map(|v| format!("{:.2}%", v * 100.0)).unwrap_or_else(|| "—".into()));
    let _ = writeln!(out, "| DNS resolution (p95) | {} | — |",
        s.p95_dns_ms.map(|v| format!("{v:.0} ms")).unwrap_or_else(|| "—".into()));
    let _ = writeln!(out, "| Outages (>{} s) | {} | 0 |", 0, s.outage_count);
    let _ = writeln!(out, "| Total outage time | {} seconds | 0 |", s.outage_total_secs);
    let _ = writeln!(out, "| Latency probes | {} | — |", s.n_latency_probes);
    let _ = writeln!(out, "| Throughput probes | {} | — |", s.n_throughput_probes);
    let _ = writeln!(out);
    let _ = writeln!(out, "---");
    let _ = writeln!(out);
    let _ = writeln!(out, "## Findings");
    let _ = writeln!(out);

    for f in &report.findings {
        let icon = if f.hit { "✗" } else { "✓" };
        let _ = writeln!(out, "### {icon} {} · {:?} severity", f.title, f.severity);
        let _ = writeln!(out);
        let _ = writeln!(out, "{}", f.detail);
        let _ = writeln!(out);
    }

    let _ = writeln!(out, "---");
    let _ = writeln!(out);
    let _ = writeln!(out, "*Generated by [ISP Watchdog](https://github.com/cperos-xr/isp-watchdog). Data stored locally — no telemetry.*");

    out
}

#[tauri::command]
pub fn save_personal(state: State<'_, AppState>, input: PersonalInput) -> Result<(), String> {
    if let Some(n) = input.customer_name {
        repo::set_setting(&state.pool, SETTING_CUSTOMER_NAME, &n).map_err(|e| e.to_string())?;
    }
    if let Some(a) = input.account_number {
        repo::set_setting(&state.pool, SETTING_ACCOUNT_NUMBER, &a).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_pollinations_key(state: State<'_, AppState>) -> Result<Option<String>, String> {
    repo::get_setting(&state.pool, SETTING_POLLINATIONS_KEY).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_pollinations_key(state: State<'_, AppState>, key: Option<String>) -> Result<(), String> {
    if let Some(k) = key {
        repo::set_setting(&state.pool, SETTING_POLLINATIONS_KEY, &k).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pollinations_generate(
    state: State<'_, AppState>,
    prompt: String,
    model: Option<String>,
    short: bool,
) -> Result<String, String> {
    // Retrieve stored user key
    let key = repo::get_setting(&state.pool, SETTING_POLLINATIONS_KEY).map_err(|e| e.to_string())?;
    let api_key = key.ok_or_else(|| "Pollinations API key not configured".to_string())?;

    let client = reqwest::Client::new();
    let model_name = model.unwrap_or_else(|| "openai".to_string());
    let max_tokens = if short { 200 } else { 1200 };

    let body = serde_json::json!({
        "model": model_name,
        "messages": [{ "role": "user", "content": prompt }],
        "max_tokens": max_tokens,
    });

    let resp = client
        .post("https://gen.pollinations.ai/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Pollinations error: {} - {}", status, text));
    }

    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if let Some(c) = v.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("message")).and_then(|m| m.get("content")).and_then(|s| s.as_str()) {
        Ok(c.to_string())
    } else if let Some(r) = v.get("result").and_then(|r| r.as_str()) {
        Ok(r.to_string())
    } else {
        Ok(text)
    }
}
