//! Sparse throughput probe against Cloudflare's open speed-test endpoint.
//!
//! Endpoint: https://speed.cloudflare.com/__down?bytes=N and /__up
//! We measure wall-clock for a fixed payload and report mbps. This is intentionally
//! conservative (small payload) to avoid burning the user's data cap; the full
//! "run-now" UI button can pass a larger payload.

use anyhow::Result;
use futures::StreamExt;
use std::time::Instant;

const ENDPOINT_DOWN: &str = "https://speed.cloudflare.com/__down";
const ENDPOINT_UP: &str = "https://speed.cloudflare.com/__up";

/// Default payload sizes for sparse background probes.
pub const DEFAULT_DOWN_BYTES: usize = 5 * 1024 * 1024; // 5 MB
pub const DEFAULT_UP_BYTES: usize = 1 * 1024 * 1024; // 1 MB

#[derive(Debug, Clone, Copy)]
pub struct ThroughputResult {
    pub down_mbps: Option<f64>,
    pub up_mbps: Option<f64>,
}

pub async fn run(down_bytes: usize, up_bytes: usize) -> Result<ThroughputResult> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()?;

    let down_mbps = measure_download(&client, down_bytes).await.ok();
    let up_mbps = measure_upload(&client, up_bytes).await.ok();

    Ok(ThroughputResult {
        down_mbps,
        up_mbps,
    })
}

async fn measure_download(client: &reqwest::Client, bytes: usize) -> Result<f64> {
    let url = format!("{ENDPOINT_DOWN}?bytes={bytes}");
    let start = Instant::now();
    let resp = client.get(&url).send().await?.error_for_status()?;
    let mut stream = resp.bytes_stream();
    let mut total: u64 = 0;
    while let Some(chunk) = stream.next().await {
        total += chunk?.len() as u64;
    }
    let elapsed = start.elapsed().as_secs_f64().max(1e-6);
    let mbps = (total as f64 * 8.0) / 1_000_000.0 / elapsed;
    Ok(mbps)
}

async fn measure_upload(client: &reqwest::Client, bytes: usize) -> Result<f64> {
    let payload = vec![0u8; bytes];
    let len = payload.len() as u64;
    let start = Instant::now();
    let _ = client
        .post(ENDPOINT_UP)
        .body(payload)
        .send()
        .await?
        .error_for_status()?;
    let elapsed = start.elapsed().as_secs_f64().max(1e-6);
    let mbps = (len as f64 * 8.0) / 1_000_000.0 / elapsed;
    Ok(mbps)
}
