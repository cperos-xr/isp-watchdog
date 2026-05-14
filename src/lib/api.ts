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
};
