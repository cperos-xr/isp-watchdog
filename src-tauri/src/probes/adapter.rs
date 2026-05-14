//! Detect the active network adapter: gateway IP, link speed, ethernet vs wifi.
//!
//! Uses `default-net` to read the OS routing table. SSID detection per-OS is
//! noisy and is left as a future enhancement; `link_type` reports "wifi" /
//! "ethernet" / "other" based on the adapter name/flags where possible.

use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize)]
pub struct AdapterInfo {
    pub gateway_ip: Option<String>,
    pub gateway_mac: Option<String>,
    pub link_type: Option<String>,
    pub link_speed_mbps: Option<i64>,
    pub ssid: Option<String>,
}

pub fn probe() -> AdapterInfo {
    let mut info = AdapterInfo::default();

    if let Ok(iface) = default_net::get_default_interface() {
        if let Some(gw) = iface.gateway {
            info.gateway_ip = Some(gw.ip_addr.to_string());
            info.gateway_mac = Some(format_mac(&gw.mac_addr.octets()));
        }
        if iface.transmit_speed.is_some() {
            // bps → mbps
            info.link_speed_mbps =
                iface.transmit_speed.map(|s| (s / 1_000_000) as i64);
        }
        info.link_type = Some(classify_link(&iface.name, &iface.friendly_name));
    }

    info
}

fn format_mac(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(":")
}

fn classify_link(name: &str, friendly: &Option<String>) -> String {
    let haystack = format!(
        "{} {}",
        name.to_lowercase(),
        friendly.as_deref().unwrap_or("").to_lowercase()
    );
    if haystack.contains("wi-fi")
        || haystack.contains("wifi")
        || haystack.contains("wlan")
        || haystack.contains("wireless")
    {
        "wifi".to_string()
    } else if haystack.contains("ethernet") || haystack.contains("eth") {
        "ethernet".to_string()
    } else {
        "other".to_string()
    }
}
