import { invoke } from "@tauri-apps/api/core";

export type HealthState = "Healthy" | "Degraded" | "Outage" | "Paused" | "Unknown";

export interface Measurement {
  id?: number;
  ts: number;
  kind: string;
  gateway_ip?: string | null;
  gateway_mac?: string | null;
  ssid?: string | null;
  link_type?: string | null;
  link_speed_mbps?: number | null;
  gateway_rtt_ms?: number | null;
  gateway_loss_pct?: number | null;
  internet_rtt_ms?: number | null;
  internet_loss_pct?: number | null;
  dns_ms?: number | null;
  down_mbps?: number | null;
  up_mbps?: number | null;
  public_ip?: string | null;
  asn?: string | null;
  asn_org?: string | null;
}

export interface Plan {
  id?: number;
  isp: string;
  plan_name: string;
  advertised_down: number;
  advertised_up: number;
  monthly_cost_cents?: number | null;
  currency?: string | null;
  contract_start?: number | null;
  source: string;
  active: boolean;
}

export interface IspEntry {
  id: string;
  name: string;
  support_email?: string | null;
  support_phone?: string | null;
  complaint_form_url?: string | null;
  terms_url?: string | null;
  notes?: string | null;
}

export type CaseStrength =
  | "None"
  | "Weak"
  | "Moderate"
  | "Strong"
  | "RegulatoryReady";

export interface Finding {
  id: string;
  title: string;
  detail: string;
  severity: "Low" | "Medium" | "High";
  hit: boolean;
}

export interface CaseReport {
  window_days: number;
  strength: CaseStrength;
  score: number;
  findings: Finding[];
  summary: {
    n_latency_probes: number;
    n_throughput_probes: number;
    median_down_mbps?: number | null;
    median_up_mbps?: number | null;
    median_internet_rtt_ms?: number | null;
    median_gateway_rtt_ms?: number | null;
    p95_dns_ms?: number | null;
    mean_internet_loss_pct?: number | null;
    outage_count: number;
    outage_total_secs: number;
    advertised_down?: number | null;
  };
}

export interface Equipment {
  id?: number;
  role: "modem" | "router" | "gateway" | "switch" | "other";
  vendor?: string | null;
  model?: string | null;
  firmware?: string | null;
  ownership: "rented" | "owned" | "unknown";
  max_down_mbps?: number | null;
  max_up_mbps?: number | null;
  docsis_version?: string | null;
  notes?: string | null;
}

export interface Thresholds {
  window_days: number;
  min_down_ratio_median: number;
  bad_probe_ratio: number;
  bad_probe_threshold: number;
  min_outages_for_hit: number;
  outage_duration_secs: number;
  high_internet_rtt_ms: number;
  healthy_gateway_rtt_ms: number;
  high_packet_loss_pct: number;
  high_dns_p95_ms: number;
}

export interface DashboardSnapshot {
  state: HealthState;
  last_measurement: Measurement | null;
  plan: Plan | null;
}

export interface EmailDraft {
  template: string;
  to: string;
  subject: string;
  body: string;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface PollinationsAccountSnapshot {
  key: JsonValue | null;
  balance: JsonValue | null;
  usage: JsonValue | null;
  daily: JsonValue | null;
  errors: string[];
}

export interface PollinationsAccountSummary {
  valid: boolean | null;
  keyType: string | null;
  scopes: string[];
  balance: number | null;
  todaySpend: number | null;
  todayRequests: number | null;
  recentAverageCost: number | null;
  recentMaxCost: number | null;
  warnings: string[];
}

export const DEFAULT_POLLINATIONS_MODEL = "gpt-5.4-mini";

export interface PollinationsDeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string | null;
  expiresIn?: number | null;
  interval?: number | null;
}

type JsonObject = { [key: string]: JsonValue };

function isJsonObject(value: JsonValue | null | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeJsonKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toNumber(value: JsonValue | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectNamedValues(
  value: JsonValue | null | undefined,
  names: string[],
  matches: JsonValue[] = [],
): JsonValue[] {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedValues(item, names, matches);
    return matches;
  }

  if (!isJsonObject(value)) return matches;

  const wanted = new Set(names.map(normalizeJsonKey));
  for (const [key, child] of Object.entries(value)) {
    if (wanted.has(normalizeJsonKey(key))) matches.push(child);
    collectNamedValues(child, names, matches);
  }
  return matches;
}

function firstNamedNumber(value: JsonValue | null | undefined, names: string[]): number | null {
  for (const candidate of collectNamedValues(value, names)) {
    const parsed = toNumber(candidate);
    if (parsed != null) return parsed;
  }
  return null;
}

function firstNamedBoolean(value: JsonValue | null | undefined, names: string[]): boolean | null {
  for (const candidate of collectNamedValues(value, names)) {
    if (typeof candidate === "boolean") return candidate;
    if (typeof candidate === "string") {
      if (candidate === "true") return true;
      if (candidate === "false") return false;
    }
  }
  return null;
}

function firstNamedString(value: JsonValue | null | undefined, names: string[]): string | null {
  for (const candidate of collectNamedValues(value, names)) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function collectNamedStrings(value: JsonValue | null | undefined, names: string[]): string[] {
  const out = new Set<string>();
  for (const candidate of collectNamedValues(value, names)) {
    if (typeof candidate === "string") {
      for (const part of candidate.split(/[\s,]+/)) {
        if (part.trim()) out.add(part.trim());
      }
      continue;
    }
    if (Array.isArray(candidate)) {
      for (const part of candidate) {
        if (typeof part === "string" && part.trim()) out.add(part.trim());
      }
    }
  }
  return [...out];
}

function extractRecords(value: JsonValue | null | undefined): JsonObject[] {
  if (Array.isArray(value)) return value.filter(isJsonObject);
  if (!isJsonObject(value)) return [];

  for (const key of ["items", "data", "results", "usage", "days", "records", "entries"]) {
    const child = value[key];
    if (Array.isArray(child)) return child.filter(isJsonObject);
  }

  return [];
}

function extractCost(value: JsonValue | null | undefined): number | null {
  return firstNamedNumber(value, ["cost", "pollen", "spent", "amount", "total", "credits"]);
}

export function summarizePollinationsAccount(
  snapshot: PollinationsAccountSnapshot | null,
): PollinationsAccountSummary {
  if (!snapshot) {
    return {
      valid: null,
      keyType: null,
      scopes: [],
      balance: null,
      todaySpend: null,
      todayRequests: null,
      recentAverageCost: null,
      recentMaxCost: null,
      warnings: [],
    };
  }

  const usageRecords = extractRecords(snapshot.usage);
  const dailyRecords = extractRecords(snapshot.daily);
  const recentCosts = usageRecords
    .map((item) => extractCost(item))
    .filter((value): value is number => value != null && value > 0)
    .slice(0, 5);
  const todayRecord = dailyRecords[dailyRecords.length - 1] ?? snapshot.daily;
  const warnings = [...snapshot.errors];
  const balance =
    firstNamedNumber(snapshot.balance, ["balance", "remaining", "available", "pollen", "credits"]) ??
    extractCost(snapshot.balance);
  const valid = firstNamedBoolean(snapshot.key, ["valid", "isValid", "ok"]);
  const keyType = firstNamedString(snapshot.key, ["type", "keyType", "kind"]);
  const scopes = collectNamedStrings(snapshot.key, ["scope", "scopes", "permissions"]);

  if (warnings.some((warning) => warning.includes("403"))) {
    warnings.push("This key may be missing usage scope, so balance history could be incomplete.");
  }
  if (balance != null && balance <= 0) {
    warnings.push("Pollinations balance looks empty. Refill or wait before running more AI actions.");
  }

  return {
    valid,
    keyType,
    scopes,
    balance,
    todaySpend:
      firstNamedNumber(todayRecord, ["cost", "pollen", "spent", "amount", "total"]) ??
      extractCost(snapshot.daily),
    todayRequests:
      firstNamedNumber(todayRecord, ["requests", "requestCount", "count", "calls"]),
    recentAverageCost:
      recentCosts.length > 0
        ? recentCosts.reduce((sum, value) => sum + value, 0) / recentCosts.length
        : null,
    recentMaxCost: recentCosts.length > 0 ? Math.max(...recentCosts) : null,
    warnings: [...new Set(warnings)],
  };
}

export const api = {
  dashboardSnapshot: () => invoke<DashboardSnapshot>("dashboard_snapshot"),
  listMeasurements: (since_ts: number) =>
    invoke<Measurement[]>("list_measurements", { sinceTs: since_ts }),
  savePlan: (plan: Omit<Plan, "id" | "active" | "source"> & { source?: string }) =>
    invoke<number>("save_plan", { plan }),
  getActivePlan: () => invoke<Plan | null>("get_active_plan"),
  getThresholds: () => invoke<Thresholds>("get_thresholds"),
  saveThresholds: (thresholds: Thresholds) =>
    invoke<void>("save_thresholds", { thresholds }),
  caseReport: () => invoke<CaseReport>("case_report"),
  ispCatalog: () => invoke<IspEntry[]>("isp_catalog"),
  fccUrl: () => invoke<string>("fcc_url"),
  draftEmail: (tier: string, to: string) =>
    invoke<EmailDraft>("draft_email", { req: { tier, to } }),
  buildMailto: (draft: EmailDraft) => invoke<string>("build_mailto", { draft }),
  runThroughputNow: () => invoke<string>("run_throughput_now"),
  savePersonal: (input: { customer_name?: string; account_number?: string }) =>
    invoke<void>("save_personal", { input }),
  listEquipment: () => invoke<Equipment[]>("list_equipment"),
  saveEquipment: (items: Equipment[]) => invoke<void>("save_equipment", { items }),
  exportMarkdown: () => invoke<string>("export_markdown"),
  saveMarkdownReport: () => invoke<string>("save_markdown_report"),
  quitApp: () => invoke<void>("quit_app"),
  // Pollinations (BYOP) integration
  pollinationsGetKey: () => invoke<string | null>("get_pollinations_key"),
  pollinationsSaveKey: (key?: string | null) => invoke<void>("save_pollinations_key", { key }),
  pollinationsGetModel: () => invoke<string | null>("get_pollinations_model"),
  pollinationsSaveModel: (model?: string | null) =>
    invoke<void>("save_pollinations_model", { model }),
  pollinationsAccountSnapshot: () =>
    invoke<PollinationsAccountSnapshot>("pollinations_account_snapshot"),
  pollinationsGenerate: (prompt: string, model?: string | null, short?: boolean) =>
    invoke<string>("pollinations_generate", { prompt, model, short }),
  pollinationsDeviceStart: (client_id?: string | null) =>
    invoke<PollinationsDeviceStart>("pollinations_device_start", { client_id }),
  pollinationsDevicePoll: (device_code: string) =>
    invoke<string | null>("pollinations_device_token_poll", { device_code }),
};
