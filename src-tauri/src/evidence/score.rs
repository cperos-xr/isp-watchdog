//! Threshold engine + case-strength scoring.
//!
//! Each threshold contributes weighted points when "hit". Total points map to a
//! `CaseStrength` band. The returned `CaseReport` lists every finding so the UI
//! and the email-template renderer can cite the specific failure modes.

use serde::{Deserialize, Serialize};

use super::thresholds::Thresholds;
use crate::db::repo::{EventRecord, Measurement, Plan};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CaseStrength {
    None,
    Weak,
    Moderate,
    Strong,
    RegulatoryReady,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Severity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize)]
pub struct Finding {
    pub id: &'static str,
    pub title: &'static str,
    pub detail: String,
    pub severity: Severity,
    pub hit: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaseReport {
    pub window_days: u32,
    pub strength: CaseStrength,
    pub score: u32,
    pub findings: Vec<Finding>,
    pub summary: SummaryStats,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SummaryStats {
    pub n_latency_probes: usize,
    pub n_throughput_probes: usize,
    pub median_down_mbps: Option<f64>,
    pub median_up_mbps: Option<f64>,
    pub median_internet_rtt_ms: Option<f64>,
    pub median_gateway_rtt_ms: Option<f64>,
    pub p95_dns_ms: Option<f64>,
    pub mean_internet_loss_pct: Option<f64>,
    pub outage_count: u32,
    pub outage_total_secs: u64,
    pub advertised_down: Option<f64>,
}

pub fn score_case(
    measurements: &[Measurement],
    events: &[EventRecord],
    plan: Option<&Plan>,
    t: &Thresholds,
) -> CaseReport {
    let summary = summarize(measurements, events, plan, t.outage_duration_secs);
    let mut findings: Vec<Finding> = Vec::new();
    let mut points: u32 = 0;

    // High-weight signals (3 points each).
    if let (Some(advertised), Some(median_down)) = (summary.advertised_down, summary.median_down_mbps)
    {
        let ratio = if advertised > 0.0 {
            median_down / advertised
        } else {
            1.0
        };
        let hit = ratio < t.min_down_ratio_median;
        findings.push(Finding {
            id: "median_down_under",
            title: "Median download below threshold",
            detail: format!(
                "Median measured download {:.1} Mbps vs advertised {:.1} Mbps ({:.0}% of plan; threshold {:.0}%).",
                median_down,
                advertised,
                ratio * 100.0,
                t.min_down_ratio_median * 100.0
            ),
            severity: Severity::High,
            hit,
        });
        if hit {
            points += 3;
        }
    }

    if let Some(advertised) = summary.advertised_down {
        let bad: usize = measurements
            .iter()
            .filter(|m| m.kind == "throughput")
            .filter(|m| {
                m.down_mbps
                    .map(|d| advertised > 0.0 && d / advertised < t.bad_probe_threshold)
                    .unwrap_or(false)
            })
            .count();
        let total = summary.n_throughput_probes.max(1);
        let ratio = bad as f64 / total as f64;
        let hit = total >= 5 && ratio >= t.bad_probe_ratio;
        findings.push(Finding {
            id: "bad_throughput_ratio",
            title: "Frequent severe throughput dips",
            detail: format!(
                "{} of {} throughput probes were under {:.0}% of advertised speed ({:.0}%; threshold {:.0}%).",
                bad,
                total,
                t.bad_probe_threshold * 100.0,
                ratio * 100.0,
                t.bad_probe_ratio * 100.0,
            ),
            severity: Severity::High,
            hit,
        });
        if hit {
            points += 3;
        }
    }

    {
        let hit = summary.outage_count >= t.min_outages_for_hit;
        findings.push(Finding {
            id: "outage_count",
            title: "Repeated outages",
            detail: format!(
                "{} outages totaling {} seconds in the last {} day(s) (threshold: ≥{} outages > {}s).",
                summary.outage_count,
                summary.outage_total_secs,
                t.window_days,
                t.min_outages_for_hit,
                t.outage_duration_secs,
            ),
            severity: Severity::High,
            hit,
        });
        if hit {
            points += 3;
        }
    }

    // Medium-weight signals (2 points each).
    if let (Some(int_rtt), Some(gw_rtt)) =
        (summary.median_internet_rtt_ms, summary.median_gateway_rtt_ms)
    {
        let hit = int_rtt > t.high_internet_rtt_ms && gw_rtt < t.healthy_gateway_rtt_ms;
        findings.push(Finding {
            id: "high_internet_rtt_low_gw",
            title: "WAN latency degraded while LAN is healthy",
            detail: format!(
                "Median internet RTT {:.1} ms vs gateway RTT {:.1} ms — strong indicator the issue is on the ISP side of the modem.",
                int_rtt, gw_rtt
            ),
            severity: Severity::Medium,
            hit,
        });
        if hit {
            points += 2;
        }
    }

    if let Some(loss) = summary.mean_internet_loss_pct {
        let hit = loss > t.high_packet_loss_pct;
        findings.push(Finding {
            id: "packet_loss",
            title: "Elevated packet loss",
            detail: format!(
                "Mean packet loss to public targets: {:.2}% (threshold {:.2}%).",
                loss * 100.0,
                t.high_packet_loss_pct * 100.0,
            ),
            severity: Severity::Medium,
            hit,
        });
        if hit {
            points += 2;
        }
    }

    // Low-weight signals (1 point each).
    if let Some(dns_p95) = summary.p95_dns_ms {
        let hit = dns_p95 > t.high_dns_p95_ms;
        findings.push(Finding {
            id: "dns_slow",
            title: "Slow DNS resolution",
            detail: format!("p95 DNS resolution: {:.0} ms (threshold {:.0} ms).", dns_p95, t.high_dns_p95_ms),
            severity: Severity::Low,
            hit,
        });
        if hit {
            points += 1;
        }
    }

    let strength = match points {
        0 => CaseStrength::None,
        1..=2 => CaseStrength::Weak,
        3..=4 => CaseStrength::Moderate,
        5..=7 => CaseStrength::Strong,
        _ => CaseStrength::RegulatoryReady,
    };

    CaseReport {
        window_days: t.window_days,
        strength,
        score: points,
        findings,
        summary,
    }
}

fn summarize(
    measurements: &[Measurement],
    events: &[EventRecord],
    plan: Option<&Plan>,
    min_outage_secs: u64,
) -> SummaryStats {
    let mut s = SummaryStats::default();
    s.advertised_down = plan.map(|p| p.advertised_down);

    let mut downs: Vec<f64> = Vec::new();
    let mut ups: Vec<f64> = Vec::new();
    let mut int_rtts: Vec<f64> = Vec::new();
    let mut gw_rtts: Vec<f64> = Vec::new();
    let mut dns: Vec<f64> = Vec::new();
    let mut losses: Vec<f64> = Vec::new();

    for m in measurements {
        match m.kind.as_str() {
            "throughput" => {
                s.n_throughput_probes += 1;
                if let Some(d) = m.down_mbps {
                    downs.push(d);
                }
                if let Some(u) = m.up_mbps {
                    ups.push(u);
                }
            }
            _ => {
                s.n_latency_probes += 1;
            }
        }
        if let Some(v) = m.internet_rtt_ms {
            int_rtts.push(v);
        }
        if let Some(v) = m.gateway_rtt_ms {
            gw_rtts.push(v);
        }
        if let Some(v) = m.dns_ms {
            dns.push(v);
        }
        if let Some(v) = m.internet_loss_pct {
            losses.push(v);
        }
    }

    s.median_down_mbps = median(&mut downs);
    s.median_up_mbps = median(&mut ups);
    s.median_internet_rtt_ms = median(&mut int_rtts);
    s.median_gateway_rtt_ms = median(&mut gw_rtts);
    s.p95_dns_ms = percentile(&mut dns, 0.95);
    s.mean_internet_loss_pct = if losses.is_empty() {
        None
    } else {
        Some(losses.iter().sum::<f64>() / losses.len() as f64)
    };

    let mut start: Option<i64> = None;
    let mut count = 0u32;
    let mut total_secs: u64 = 0;
    for e in events {
        match e.kind.as_str() {
            "outage_start" => start = Some(e.ts),
            "outage_end" => {
                if let Some(st) = start.take() {
                    let dur = ((e.ts - st).max(0) / 1000) as u64;
                    if dur >= min_outage_secs {
                        total_secs += dur;
                        count += 1;
                    }
                }
            }
            _ => {}
        }
    }
    s.outage_count = count;
    s.outage_total_secs = total_secs;
    s
}

fn median(values: &mut Vec<f64>) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    Some(values[values.len() / 2])
}

fn percentile(values: &mut Vec<f64>, p: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = ((values.len() as f64 - 1.0) * p).round() as usize;
    Some(values[idx])
}
