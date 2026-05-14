use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thresholds {
    pub window_days: u32,
    pub min_down_ratio_median: f64,        // hit if median 7d download < ratio * advertised
    pub bad_probe_ratio: f64,              // fraction of throughput probes that are 'bad'
    pub bad_probe_threshold: f64,          // a probe is 'bad' if down < threshold * advertised
    pub min_outages_for_hit: u32,
    pub outage_duration_secs: u64,         // a gap > this between successful probes counts as outage
    pub high_internet_rtt_ms: f64,
    pub healthy_gateway_rtt_ms: f64,
    pub high_packet_loss_pct: f64,         // 0.0–1.0
    pub high_dns_p95_ms: f64,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            window_days: 7,
            min_down_ratio_median: 0.60,
            bad_probe_ratio: 0.10,
            bad_probe_threshold: 0.50,
            min_outages_for_hit: 5,
            outage_duration_secs: 300,
            high_internet_rtt_ms: 150.0,
            healthy_gateway_rtt_ms: 10.0,
            high_packet_loss_pct: 0.02,
            high_dns_p95_ms: 500.0,
        }
    }
}
