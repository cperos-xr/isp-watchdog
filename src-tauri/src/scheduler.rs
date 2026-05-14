//! Background probe scheduler.
//!
//! Runs two loops in `tokio`:
//!   * a fast loop for latency/DNS/adapter (~60 s + jitter)
//!   * a slow loop for sparse throughput tests (~30 min + jitter)
//!
//! Jitter avoids the entire user base hitting endpoints in lockstep, which would
//! make the app's traffic easy to fingerprint and throttle.
//!
//! The loops emit a tray-color signal via the `state` channel so the UI/tray can
//! reflect health without re-querying the DB on every render.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use rand::Rng;
use serde::{Deserialize, Serialize};
use tokio::sync::watch;

use crate::db::repo::{self, EventRecord, Measurement};
use crate::db::DbPool;
use crate::probes;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum HealthState {
    Healthy,
    Degraded,
    Outage,
    Paused,
    Unknown,
}

#[derive(Clone)]
pub struct SchedulerHandle {
    pub state_rx: watch::Receiver<HealthState>,
    pub pause: Arc<tokio::sync::Notify>,
}

#[derive(Debug, Clone)]
pub struct SchedulerConfig {
    pub fast_interval_secs: u64,    // default 60
    pub slow_interval_secs: u64,    // default 1800
    pub jitter_secs: u64,           // ±jitter
    pub fast_enabled: bool,
    pub slow_enabled: bool,
    pub down_payload_bytes: usize,
    pub up_payload_bytes: usize,
    pub public_targets: Vec<String>,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            fast_interval_secs: 60,
            slow_interval_secs: 1800,
            jitter_secs: 10,
            fast_enabled: true,
            slow_enabled: true,
            down_payload_bytes: probes::throughput::DEFAULT_DOWN_BYTES,
            up_payload_bytes: probes::throughput::DEFAULT_UP_BYTES,
            public_targets: probes::latency::DEFAULT_PUBLIC_TARGETS
                .iter()
                .map(|s| s.to_string())
                .collect(),
        }
    }
}

pub fn spawn(pool: DbPool, config: SchedulerConfig) -> SchedulerHandle {
    let (state_tx, state_rx) = watch::channel(HealthState::Unknown);
    let pause = Arc::new(tokio::sync::Notify::new());

    let pool_fast = pool.clone();
    let cfg_fast = config.clone();
    let state_tx_fast = state_tx.clone();
    tauri::async_runtime::spawn(async move {
        fast_loop(pool_fast, cfg_fast, state_tx_fast).await;
    });

    let pool_slow = pool.clone();
    let cfg_slow = config.clone();
    tauri::async_runtime::spawn(async move {
        slow_loop(pool_slow, cfg_slow).await;
    });

    SchedulerHandle { state_rx, pause }
}

async fn fast_loop(pool: DbPool, cfg: SchedulerConfig, state_tx: watch::Sender<HealthState>) {
    if !cfg.fast_enabled {
        return;
    }
    let mut prev_outage = false;
    loop {
        let new_state = match run_fast_probe(&pool, &cfg).await {
            Ok(state) => state,
            Err(e) => {
                log::warn!("fast probe failed: {e:?}");
                HealthState::Unknown
            }
        };
        let now_outage = new_state == HealthState::Outage;
        if now_outage != prev_outage {
            record_outage_transition(&pool, now_outage);
            prev_outage = now_outage;
        }
        let _ = state_tx.send(new_state);
        sleep_with_jitter(cfg.fast_interval_secs, cfg.jitter_secs).await;
    }
}

fn record_outage_transition(pool: &DbPool, started: bool) {
    let event = EventRecord {
        id: None,
        ts: chrono::Utc::now().timestamp_millis(),
        kind: if started { "outage_start" } else { "outage_end" }.to_string(),
        payload: None,
    };
    if let Err(e) = repo::insert_event(pool, &event) {
        log::warn!("failed to record outage event: {e:?}");
    }
}

async fn slow_loop(pool: DbPool, cfg: SchedulerConfig) {
    if !cfg.slow_enabled {
        return;
    }
    // Stagger the first slow probe so it doesn't fire alongside the first fast probe.
    tokio::time::sleep(Duration::from_secs(45)).await;
    loop {
        if let Err(e) = run_slow_probe(&pool, &cfg).await {
            log::warn!("slow probe failed: {e:?}");
        }
        sleep_with_jitter(cfg.slow_interval_secs, cfg.jitter_secs * 6).await;
    }
}

async fn run_fast_probe(pool: &DbPool, cfg: &SchedulerConfig) -> Result<HealthState> {
    let adapter = probes::adapter::probe();
    let gateway_stats = match adapter.gateway_ip.as_deref() {
        Some(gw) => probes::latency::ping_gateway(gw, 5).await.ok(),
        None => None,
    };
    let public_targets: Vec<&str> = cfg.public_targets.iter().map(|s| s.as_str()).collect();
    let public_stats = probes::latency::ping_public(&public_targets, 3).await;
    let dns_avg = probes::dns::probe_avg(probes::dns::DEFAULT_DNS_HOSTS).await;
    let pub_info = probes::dns::fetch_public_info().await;

    let m = Measurement {
        id: None,
        ts: chrono::Utc::now().timestamp_millis(),
        kind: "latency".to_string(),
        gateway_ip: adapter.gateway_ip.clone(),
        gateway_mac: adapter.gateway_mac.clone(),
        ssid: adapter.ssid.clone(),
        link_type: adapter.link_type.clone(),
        link_speed_mbps: adapter.link_speed_mbps,
        gateway_rtt_ms: gateway_stats.as_ref().and_then(|s| s.median_rtt_ms),
        gateway_loss_pct: gateway_stats.as_ref().map(|s| s.loss_pct),
        internet_rtt_ms: public_stats.median_rtt_ms,
        internet_loss_pct: Some(public_stats.loss_pct),
        dns_ms: dns_avg,
        down_mbps: None,
        up_mbps: None,
        public_ip: pub_info.ip.clone(),
        asn: pub_info.asn.clone(),
        asn_org: pub_info.asn_org.clone(),
    };
    repo::insert_measurement(pool, &m)?;
    Ok(classify(&m))
}

async fn run_slow_probe(pool: &DbPool, cfg: &SchedulerConfig) -> Result<()> {
    let adapter = probes::adapter::probe();
    let result = probes::throughput::run(cfg.down_payload_bytes, cfg.up_payload_bytes).await?;
    let pub_info = probes::dns::fetch_public_info().await;
    let m = Measurement {
        id: None,
        ts: chrono::Utc::now().timestamp_millis(),
        kind: "throughput".to_string(),
        gateway_ip: adapter.gateway_ip.clone(),
        gateway_mac: adapter.gateway_mac.clone(),
        ssid: adapter.ssid.clone(),
        link_type: adapter.link_type.clone(),
        link_speed_mbps: adapter.link_speed_mbps,
        gateway_rtt_ms: None,
        gateway_loss_pct: None,
        internet_rtt_ms: None,
        internet_loss_pct: None,
        dns_ms: None,
        down_mbps: result.down_mbps,
        up_mbps: result.up_mbps,
        public_ip: pub_info.ip.clone(),
        asn: pub_info.asn.clone(),
        asn_org: pub_info.asn_org.clone(),
    };
    repo::insert_measurement(pool, &m)?;
    Ok(())
}

fn classify(m: &Measurement) -> HealthState {
    // Outage: 100% loss to public targets, or no gateway, or no public IP.
    let loss = m.internet_loss_pct.unwrap_or(1.0);
    if loss >= 0.95 {
        return HealthState::Outage;
    }
    // Degraded: noticeable loss, high latency, or DNS timeout.
    if loss > 0.05 || m.internet_rtt_ms.unwrap_or(0.0) > 200.0 || m.dns_ms.unwrap_or(0.0) > 500.0
    {
        return HealthState::Degraded;
    }
    HealthState::Healthy
}

async fn sleep_with_jitter(base_secs: u64, jitter_secs: u64) {
    let jitter: i64 = {
        let mut rng = rand::thread_rng();
        rng.gen_range(-(jitter_secs as i64)..=jitter_secs as i64)
    };
    let secs = (base_secs as i64 + jitter).max(5) as u64;
    tokio::time::sleep(Duration::from_secs(secs)).await;
}
