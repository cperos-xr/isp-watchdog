import type { HealthState } from "../lib/api";

export function HealthPill({ state }: { state: HealthState }) {
  const cls = state.toLowerCase();
  return (
    <span className={`pill ${cls}`}>
      <span className="dot" />
      {state}
    </span>
  );
}
