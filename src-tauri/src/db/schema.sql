-- ISP Watchdog SQLite schema
-- All timestamps are unix epoch milliseconds.

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS measurements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts              INTEGER NOT NULL,
    kind            TEXT    NOT NULL,                -- 'latency' | 'throughput'
    gateway_ip      TEXT,
    gateway_mac     TEXT,
    ssid            TEXT,
    link_type       TEXT,                            -- 'ethernet' | 'wifi' | 'other'
    link_speed_mbps INTEGER,
    gateway_rtt_ms  REAL,
    gateway_loss_pct REAL,
    internet_rtt_ms REAL,
    internet_loss_pct REAL,
    dns_ms          REAL,
    down_mbps       REAL,
    up_mbps         REAL,
    public_ip       TEXT,
    asn             TEXT,
    asn_org         TEXT
);
CREATE INDEX IF NOT EXISTS idx_measurements_ts   ON measurements(ts);
CREATE INDEX IF NOT EXISTS idx_measurements_kind ON measurements(kind, ts);

CREATE TABLE IF NOT EXISTS events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      INTEGER NOT NULL,
    kind    TEXT    NOT NULL,                        -- 'outage_start' | 'outage_end' | 'network_change' | 'note'
    payload TEXT                                     -- JSON blob
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

CREATE TABLE IF NOT EXISTS plans (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    isp               TEXT    NOT NULL,
    plan_name         TEXT    NOT NULL,
    advertised_down   REAL    NOT NULL,
    advertised_up     REAL    NOT NULL,
    monthly_cost_cents INTEGER,
    currency          TEXT    DEFAULT 'USD',
    contract_start    INTEGER,
    source            TEXT    NOT NULL DEFAULT 'manual', -- 'manual' | 'contract' | 'catalog' | 'ai'
    active            INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    role            TEXT    NOT NULL,                -- 'modem' | 'router' | 'gateway' (combined) | 'switch' | 'other'
    vendor          TEXT,
    model           TEXT,
    firmware        TEXT,
    ownership       TEXT    NOT NULL DEFAULT 'unknown', -- 'rented' | 'owned' | 'unknown'
    max_down_mbps   REAL,                            -- vendor-rated max throughput
    max_up_mbps     REAL,
    docsis_version  TEXT,                            -- '3.0' | '3.1' | null
    notes           TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equipment_active ON equipment(active);

CREATE TABLE IF NOT EXISTS sent_emails (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    template  TEXT    NOT NULL,
    to_addr   TEXT    NOT NULL,
    subject   TEXT    NOT NULL,
    body      TEXT    NOT NULL,
    delivery  TEXT    NOT NULL                       -- 'mailto' | 'smtp'
);
