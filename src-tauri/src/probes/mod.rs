pub mod adapter;
pub mod dns;
pub mod latency;
pub mod throughput;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProbeSnapshot {
    pub gateway_ip: Option<String>,
    pub gateway_mac: Option<String>,
    pub ssid: Option<String>,
    pub link_type: Option<String>,
    pub link_speed_mbps: Option<i64>,
    pub gateway_rtt_ms: Option<f64>,
    pub gateway_loss_pct: Option<f64>,
    pub internet_rtt_ms: Option<f64>,
    pub internet_loss_pct: Option<f64>,
    pub dns_ms: Option<f64>,
    pub public_ip: Option<String>,
    pub asn: Option<String>,
    pub asn_org: Option<String>,
}
