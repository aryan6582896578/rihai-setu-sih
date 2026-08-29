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
    slate: "",
    blue: "",
    amber: "warn-border",
    red: "hot-border",
    green: "",
  };
  return (
    <div className={`mini-stat ${tones[tone]}`}>
      <p className="k">{label}</p>
      <p className="v">{value}</p>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-peach border-t-terracotta" />
      {label && <span className="text-sm text-bodytext">{label}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon = "📋",
  action,
}: {
  title: string;
  body?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel">
      <div className="empty-tab">
        <div className="mb-3 text-4xl">{icon}</div>
        <p className="display text-base font-bold text-navy">{title}</p>
        {body && <p className="mt-1 text-sm">{body}</p>}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
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
  const cls =
    tone === "red" ? "pill-full" : tone === "amber" ? "pill-warn" : "pill-ok";
  return (
    <span className={cls}>{pct}% capacity</span>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,15,10,0.5)] p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card bg-white p-6 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-[#eee4d6] pb-3">
          <h3 className="display text-lg font-bold text-navy">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-bodytext hover:bg-peach/50 hover:text-navy"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
