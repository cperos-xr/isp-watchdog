use anyhow::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::DbPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Measurement {
    pub id: Option<i64>,
    pub ts: i64,
    pub kind: String,
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
    pub down_mbps: Option<f64>,
    pub up_mbps: Option<f64>,
    pub public_ip: Option<String>,
    pub asn: Option<String>,
    pub asn_org: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: Option<i64>,
    pub isp: String,
    pub plan_name: String,
    pub advertised_down: f64,
    pub advertised_up: f64,
    pub monthly_cost_cents: Option<i64>,
    pub currency: Option<String>,
    pub contract_start: Option<i64>,
    pub source: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRecord {
    pub id: Option<i64>,
    pub ts: i64,
    pub kind: String,
    pub payload: Option<String>,
}

pub fn insert_measurement(pool: &DbPool, m: &Measurement) -> Result<i64> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO measurements
            (ts, kind, gateway_ip, gateway_mac, ssid, link_type, link_speed_mbps,
             gateway_rtt_ms, gateway_loss_pct, internet_rtt_ms, internet_loss_pct,
             dns_ms, down_mbps, up_mbps, public_ip, asn, asn_org)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            m.ts, m.kind, m.gateway_ip, m.gateway_mac, m.ssid, m.link_type, m.link_speed_mbps,
            m.gateway_rtt_ms, m.gateway_loss_pct, m.internet_rtt_ms, m.internet_loss_pct,
            m.dns_ms, m.down_mbps, m.up_mbps, m.public_ip, m.asn, m.asn_org,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn insert_event(pool: &DbPool, e: &EventRecord) -> Result<i64> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO events (ts, kind, payload) VALUES (?1, ?2, ?3)",
        params![e.ts, e.kind, e.payload],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn measurements_since(pool: &DbPool, since_ts: i64) -> Result<Vec<Measurement>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, ts, kind, gateway_ip, gateway_mac, ssid, link_type, link_speed_mbps,
                gateway_rtt_ms, gateway_loss_pct, internet_rtt_ms, internet_loss_pct,
                dns_ms, down_mbps, up_mbps, public_ip, asn, asn_org
         FROM measurements WHERE ts >= ?1 ORDER BY ts ASC",
    )?;
    let rows = stmt.query_map(params![since_ts], |row| {
        Ok(Measurement {
            id: row.get(0)?,
            ts: row.get(1)?,
            kind: row.get(2)?,
            gateway_ip: row.get(3)?,
            gateway_mac: row.get(4)?,
            ssid: row.get(5)?,
            link_type: row.get(6)?,
            link_speed_mbps: row.get(7)?,
            gateway_rtt_ms: row.get(8)?,
            gateway_loss_pct: row.get(9)?,
            internet_rtt_ms: row.get(10)?,
            internet_loss_pct: row.get(11)?,
            dns_ms: row.get(12)?,
            down_mbps: row.get(13)?,
            up_mbps: row.get(14)?,
            public_ip: row.get(15)?,
            asn: row.get(16)?,
            asn_org: row.get(17)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn events_since(pool: &DbPool, since_ts: i64) -> Result<Vec<EventRecord>> {
    let conn = pool.get()?;
    let mut stmt = conn
        .prepare("SELECT id, ts, kind, payload FROM events WHERE ts >= ?1 ORDER BY ts ASC")?;
    let rows = stmt.query_map(params![since_ts], |row| {
        Ok(EventRecord {
            id: row.get(0)?,
            ts: row.get(1)?,
            kind: row.get(2)?,
            payload: row.get(3)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn active_plan(pool: &DbPool) -> Result<Option<Plan>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, isp, plan_name, advertised_down, advertised_up, monthly_cost_cents,
                currency, contract_start, source, active
         FROM plans WHERE active = 1 ORDER BY id DESC LIMIT 1",
    )?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let plan = Plan {
            id: Some(row.get(0)?),
            isp: row.get(1)?,
            plan_name: row.get(2)?,
            advertised_down: row.get(3)?,
            advertised_up: row.get(4)?,
            monthly_cost_cents: row.get(5)?,
            currency: row.get(6)?,
            contract_start: row.get(7)?,
            source: row.get(8)?,
            active: row.get::<_, i64>(9)? != 0,
        };
        Ok(Some(plan))
    } else {
        Ok(None)
    }
}

pub fn upsert_plan(pool: &DbPool, plan: &Plan) -> Result<i64> {
    let conn = pool.get()?;
    // Deactivate existing plans (single active plan invariant).
    conn.execute("UPDATE plans SET active = 0 WHERE active = 1", [])?;
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO plans
            (isp, plan_name, advertised_down, advertised_up, monthly_cost_cents, currency,
             contract_start, source, active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)",
        params![
            plan.isp,
            plan.plan_name,
            plan.advertised_down,
            plan.advertised_up,
            plan.monthly_cost_cents,
            plan.currency.clone().unwrap_or_else(|| "USD".to_string()),
            plan.contract_start,
            plan.source,
            now,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Equipment {
    pub id: Option<i64>,
    pub role: String,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub firmware: Option<String>,
    pub ownership: String,
    pub max_down_mbps: Option<f64>,
    pub max_up_mbps: Option<f64>,
    pub docsis_version: Option<String>,
    pub notes: Option<String>,
}

pub fn list_equipment(pool: &DbPool) -> Result<Vec<Equipment>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, role, vendor, model, firmware, ownership, max_down_mbps, max_up_mbps,
                docsis_version, notes
         FROM equipment WHERE active = 1 ORDER BY id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Equipment {
            id: row.get(0)?,
            role: row.get(1)?,
            vendor: row.get(2)?,
            model: row.get(3)?,
            firmware: row.get(4)?,
            ownership: row.get(5)?,
            max_down_mbps: row.get(6)?,
            max_up_mbps: row.get(7)?,
            docsis_version: row.get(8)?,
            notes: row.get(9)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn replace_equipment(pool: &DbPool, items: &[Equipment]) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    tx.execute("UPDATE equipment SET active = 0 WHERE active = 1", [])?;
    let now = chrono::Utc::now().timestamp_millis();
    for e in items {
        tx.execute(
            "INSERT INTO equipment
                (role, vendor, model, firmware, ownership, max_down_mbps, max_up_mbps,
                 docsis_version, notes, active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10)",
            params![
                e.role,
                e.vendor,
                e.model,
                e.firmware,
                e.ownership,
                e.max_down_mbps,
                e.max_up_mbps,
                e.docsis_version,
                e.notes,
                now,
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn get_setting(pool: &DbPool, key: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok();
    Ok(value)
}

pub fn set_setting(pool: &DbPool, key: &str, value: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}
