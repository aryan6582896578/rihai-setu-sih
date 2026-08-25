import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, extractApiError } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";

interface NotificationRow {
  id: string;
  recipientType: string;
  channel: string;
  message: string;
  relatedEntityType: string;
  relatedEntityId: string;
  sentAt: string;
  status: string;
  isRead: boolean;
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await api.get<{ data: NotificationRow[]; unread: number }>("/notifications");
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const query = useUnreadCount();

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/notifications/${id}/mark-read`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (query.isLoading) return <Spinner label="Loading notifications…" />;
  if (query.isError) return <ErrorBanner message={extractApiError(query.error).message} />;

  const rows = query.data?.data ?? [];
  const unread = query.data?.unread ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title mb-1.5">Notifications</h1>
        <p className="lede">
          In-app delivery log — works even when external SMS/WhatsApp isn't configured.
          {unread > 0 && (
            <span className="pill-warn ml-2">{unread} unread</span>
          )}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="🔔" title="No notifications" body="Stage changes and escalations addressed to you appear here." />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((n) => (
            <li
              key={n.id}
              className={`card-shadow rounded-card border bg-white p-4 ${
                n.isRead ? "border-transparent" : "border-saffron"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-heading">{n.message}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-bodytext">
                    {n.channel} · {n.recipientType.replace("_", " ")} · {formatDateTime(n.sentAt)} ·{" "}
                    {n.status}
                  </p>
                </div>
                {!n.isRead && (
                  <button
                    onClick={() => markRead.mutate(n.id)}
                    disabled={markRead.isPending}
                    className="btn btn-outline btn-sm disabled:opacity-50"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
