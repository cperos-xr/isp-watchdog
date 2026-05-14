//! DNS resolution timing probe and public-IP / ASN identification.

use anyhow::Result;
use hickory_resolver::config::*;
use hickory_resolver::TokioAsyncResolver;
use serde::Deserialize;
use std::time::Instant;

pub const DEFAULT_DNS_HOSTS: &[&str] = &["cloudflare.com", "google.com"];

pub async fn resolve_time(host: &str) -> Result<f64> {
    let resolver =
        TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());
    let start = Instant::now();
    let _ = resolver.lookup_ip(host).await?;
    Ok(start.elapsed().as_secs_f64() * 1000.0)
}

/// Average resolution time across the configured hosts.
pub async fn probe_avg(hosts: &[&str]) -> Option<f64> {
    let mut times: Vec<f64> = Vec::new();
    for h in hosts {
        if let Ok(t) = resolve_time(h).await {
            times.push(t);
        }
    }
    if times.is_empty() {
        None
    } else {
        Some(times.iter().sum::<f64>() / times.len() as f64)
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct PublicIpInfo {
    pub ip: Option<String>,
    pub asn: Option<String>,
    pub asn_org: Option<String>,
}

/// Use Cloudflare's `/cdn-cgi/trace` endpoint. Returns key=value lines.
pub async fn fetch_public_info() -> PublicIpInfo {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build();
    let Ok(client) = client else {
        return PublicIpInfo::default();
    };
    let resp = client
        .get("https://1.1.1.1/cdn-cgi/trace")
        .send()
        .await
        .and_then(|r| r.error_for_status());
    let Ok(resp) = resp else {
        return PublicIpInfo::default();
    };
    let Ok(text) = resp.text().await else {
        return PublicIpInfo::default();
    };

    let mut info = PublicIpInfo::default();
    for line in text.lines() {
        if let Some((k, v)) = line.split_once('=') {
            match k {
                "ip" => info.ip = Some(v.to_string()),
                _ => {}
            }
        }
    }
    info
}
