import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "slate" | "blue" | "amber" | "red" | "green";
}) {
  const tones: Record<string, string> = {
    slate: "border-slate-200",
    blue: "border-blue-200 bg-blue-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    red: "border-red-200 bg-red-50/50",
    green: "border-emerald-200 bg-emerald-50/50",
  };
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
      {label && <span className="text-sm text-slate-500">{label}</span>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {body && <p className="mt-1 text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

export function occupancyTone(pct: number): "green" | "amber" | "red" {
  if (pct > 120) return "red";
  if (pct >= 100) return "amber";
  return "green";
}

export function OccupancyBadge({ pct }: { pct: number }) {
  const tone = occupancyTone(pct);
  const styles =
    tone === "red"
      ? "bg-red-100 text-red-800 ring-red-600/20"
      : tone === "amber"
        ? "bg-amber-100 text-amber-800 ring-amber-600/20"
        : "bg-emerald-100 text-emerald-800 ring-emerald-600/20";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles}`}>
      {pct}% capacity
    </span>
  );
}
