//! ICMP ping probes for gateway and public targets.
//!
//! Returns median RTT in ms and packet loss as a fraction (0.0 – 1.0).

use anyhow::Result;
use std::net::IpAddr;
use std::time::Duration;
use surge_ping::{Client, Config, PingIdentifier, PingSequence, ICMP};

pub const DEFAULT_PUBLIC_TARGETS: &[&str] = &["1.1.1.1", "8.8.8.8", "9.9.9.9"];

#[derive(Debug, Clone, Copy)]
pub struct PingStats {
    pub median_rtt_ms: Option<f64>,
    pub loss_pct: f64,
}

pub async fn ping_target(target: IpAddr, count: u16) -> Result<PingStats> {
    let mut config = Config::default();
    config.kind = match target {
        IpAddr::V4(_) => ICMP::V4,
        IpAddr::V6(_) => ICMP::V6,
    };
    let client = Client::new(&config)?;
    let mut pinger = client.pinger(target, PingIdentifier(rand::random())).await;
    pinger.timeout(Duration::from_secs(2));

    let mut rtts: Vec<f64> = Vec::with_capacity(count as usize);
    let mut sent = 0u16;
    let payload = [0u8; 32];
    for seq in 0..count {
        sent += 1;
        match pinger.ping(PingSequence(seq), &payload).await {
            Ok((_, dur)) => rtts.push(dur.as_secs_f64() * 1000.0),
            Err(_) => {}
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }

    let received = rtts.len() as u16;
    let loss = if sent == 0 {
        0.0
    } else {
        (sent - received) as f64 / sent as f64
    };
    let median = if rtts.is_empty() {
        None
    } else {
        rtts.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        Some(rtts[rtts.len() / 2])
    };

    Ok(PingStats {
        median_rtt_ms: median,
        loss_pct: loss,
    })
}

pub async fn ping_gateway(gateway_ip: &str, count: u16) -> Result<PingStats> {
    let addr: IpAddr = gateway_ip.parse()?;
    ping_target(addr, count).await
}

/// Aggregate stats across multiple public targets: median of medians, mean loss.
pub async fn ping_public(targets: &[&str], count_each: u16) -> PingStats {
    let mut medians: Vec<f64> = Vec::new();
    let mut losses: Vec<f64> = Vec::new();
    for t in targets {
        if let Ok(addr) = t.parse::<IpAddr>() {
            if let Ok(stats) = ping_target(addr, count_each).await {
                if let Some(m) = stats.median_rtt_ms {
                    medians.push(m);
                }
                losses.push(stats.loss_pct);
            }
        }
    }
    let median = if medians.is_empty() {
        None
    } else {
        medians.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        Some(medians[medians.len() / 2])
    };
    let loss = if losses.is_empty() {
        1.0
    } else {
        losses.iter().sum::<f64>() / losses.len() as f64
    };
    PingStats {
        median_rtt_ms: median,
        loss_pct: loss,
    }
}
