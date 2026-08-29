import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KaraBazaarListingStatus, ProductionRecordDto, ProductionSummaryDto } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { roleFlags } from "../../lib/permissions";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, ErrorBanner, Modal, Spinner } from "../../components/ui";

interface Props {
  prisonerId: string;
}

const CATEGORIES = [
  "Handicrafts & Decor",
  "Textiles & Apparel",
  "Bakery & Food Processing",
  "Carpentry & Furniture",
  "Printing & Bookbinding",
  "Metalwork & Fabrication",
  "Soap & Detergents",
  "General / Housekeeping",
];

export default function PrisonProductionPanel({ prisonerId }: Props) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { canEdit } = roleFlags(user?.role);

  const [addOpen, setAddOpen] = useState(false);
  const [updateRecord, setUpdateRecord] = useState<ProductionRecordDto | null>(null);

  // Form states for add
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [quantity, setQuantity] = useState(1);
  const [saleValueEstimate, setSaleValueEstimate] = useState<string>("");
  const [formErr, setFormErr] = useState<string | null>(null);

  // Form states for status update
  const [editStatus, setEditStatus] = useState<KaraBazaarListingStatus>("not_listed");
  const [editUrl, setEditUrl] = useState("");

  const query = useQuery({
    queryKey: ["prisoner-production", prisonerId],
    queryFn: async () => {
      const res = await api.get<{ data: ProductionSummaryDto }>(`/prisoners/${prisonerId}/production`);
      return res.data.data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      setFormErr(null);
      const res = await api.post(`/prisoners/${prisonerId}/production`, {
        itemName,
        category,
        quantity: Number(quantity),
        saleValueEstimate: saleValueEstimate ? Number(saleValueEstimate) : null,
      });
      return res.data.data;
    },
    onSuccess: () => {
      setAddOpen(false);
      setItemName("");
      setQuantity(1);
      setSaleValueEstimate("");
      void queryClient.invalidateQueries({ queryKey: ["prisoner-production", prisonerId] });
      void queryClient.invalidateQueries({ queryKey: ["jail-production-summary"] });
    },
    onError: (err) => setFormErr(extractApiError(err).message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!updateRecord) return;
      await api.patch(`/production/${updateRecord.id}`, {
        karaBazaarListingStatus: editStatus,
        karaBazaarListingUrl: editUrl || null,
      });
    },
    onSuccess: () => {
      setUpdateRecord(null);
      void queryClient.invalidateQueries({ queryKey: ["prisoner-production", prisonerId] });
      void queryClient.invalidateQueries({ queryKey: ["jail-production-summary"] });
    },
  });

  if (query.isLoading) return <Spinner label="Loading prison industries data…" />;
  if (query.isError) return <ErrorBanner message={extractApiError(query.error).message} />;

  const summary = query.data!;

  const statusBadge = (status: KaraBazaarListingStatus) => {
    switch (status) {
      case "listed":
        return <span className="pill pill-ok">Listed on Kara Bazaar</span>;
      case "pending":
        return <span className="pill pill-warn">Onboarding Pending</span>;
      default:
        return <span className="pill pill-neutral">Not Listed</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary KPI Banner */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="text-xs font-semibold text-bodytext uppercase tracking-wider">Total Output</div>
          <div className="display mt-1 text-2xl font-bold text-navy">{summary.totalItems} items</div>
          <div className="mt-1 text-xs text-bodytext">Across {Object.keys(summary.byCategory).length} categories</div>
        </div>

        <div className="panel p-4">
          <div className="text-xs font-semibold text-bodytext uppercase tracking-wider">Est. Production Value</div>
          <div className="display mt-1 text-2xl font-bold text-terracotta">
            ₹{summary.totalValueEstimate.toLocaleString("en-IN")}
          </div>
          <div className="mt-1 text-xs text-bodytext">State Prison Industries valuation</div>
        </div>

        <div className="panel p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-bodytext uppercase tracking-wider">Categories</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(summary.byCategory).map(([cat, cnt]) => (
                <span key={cat} className="code-chip text-[11px]">
                  {cat}: {cnt}
                </span>
              ))}
            </div>
          </div>
          {canEdit && (
            <button onClick={() => setAddOpen(true)} className="btn btn-primary btn-sm mt-3 w-full justify-center">
              + Add Production Entry
            </button>
          )}
        </div>
      </div>

      {/* Production List Table */}
      <div className="panel-tight overflow-x-auto">
        <div className="flex items-center justify-between border-b border-[#eee4d6] px-5 py-4">
          <div>
            <h3 className="display text-base font-bold text-navy">Prison Industries Output Record</h3>
            <p className="text-xs text-bodytext">In-custody items produced, vocational work logs & Kara Bazaar listings</p>
          </div>
        </div>

        {summary.records.length === 0 ? (
          <EmptyState
            icon="🧵"
            title="No production entries recorded"
            body="Log completed vocational products or prison industry outputs for this inmate."
          />
        ) : (
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Date</th>
                <th>Est. Value</th>
                <th>Kara Bazaar Status</th>
                <th>Listing URL</th>
                {canEdit && <th className="text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {summary.records.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold text-navy">{r.itemName}</td>
                  <td><span className="code-chip">{r.category}</span></td>
                  <td className="mono-cell">{r.quantity}</td>
                  <td className="text-bodytext text-xs">{formatDate(r.producedAt)}</td>
                  <td className="font-mono text-xs font-bold text-navy">
                    {r.saleValueEstimate ? `₹${r.saleValueEstimate.toLocaleString("en-IN")}` : "-"}
                  </td>
                  <td>{statusBadge(r.karaBazaarListingStatus)}</td>
                  <td>
                    {r.karaBazaarListingUrl ? (
                      <a
                        href={r.karaBazaarListingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-terracotta hover:underline flex items-center gap-1"
                      >
                        View Listing ↗
                      </a>
                    ) : (
                      <span className="text-xs text-[#a7adb6]">-</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="text-right">
                      <button
                        onClick={() => {
                          setUpdateRecord(r);
                          setEditStatus(r.karaBazaarListingStatus);
                          setEditUrl(r.karaBazaarListingUrl ?? "");
                        }}
                        className="btn btn-outline btn-sm py-1 px-2.5 text-[11px]"
                      >
                        Edit Status
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Entry Modal */}
      {addOpen && (
        <Modal title="Log Production Entry" onClose={() => setAddOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addMutation.mutate();
            }}
            className="space-y-4"
          >
            {formErr && <ErrorBanner message={formErr} />}

            <div className="field">
              <label className="font-semibold text-navy text-sm">Item Name *</label>
              <input
                required
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Handwoven Cotton Bedspread / Wooden Chair"
                className="input-base"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="font-semibold text-navy text-sm">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input-base"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="font-semibold text-navy text-sm">Quantity *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="input-base"
                />
              </div>
            </div>

            <div className="field">
              <label className="font-semibold text-navy text-sm">Est. Sale Value (₹)</label>
              <input
                type="number"
                min="0"
                value={saleValueEstimate}
                onChange={(e) => setSaleValueEstimate(e.target.value)}
                placeholder="Optional estimated valuation (e.g. 450)"
                className="input-base"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setAddOpen(false)} className="btn btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={addMutation.isPending} className="btn btn-primary">
                {addMutation.isPending ? "Saving..." : "Save Entry"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Kara Bazaar Status Modal */}
      {updateRecord && (
        <Modal title="Update Kara Bazaar Listing Status" onClose={() => setUpdateRecord(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="field">
              <label className="font-semibold text-navy text-sm">Item</label>
              <input disabled value={`${updateRecord.itemName} (${updateRecord.category})`} className="input-base bg-[#f4ede2]" />
            </div>

            <div className="field">
              <label className="font-semibold text-navy text-sm">Kara Bazaar Listing Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as KaraBazaarListingStatus)}
                className="input-base"
              >
                <option value="not_listed">Not Listed</option>
                <option value="pending">Onboarding Pending</option>
                <option value="listed">Listed on Kara Bazaar</option>
              </select>
            </div>

            <div className="field">
              <label className="font-semibold text-navy text-sm">Kara Bazaar Product URL</label>
              <input
                type="url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://karabazaar.eprisons.gov.in/item/12345"
                className="input-base"
              />
              <p className="mt-1 text-[11px] text-bodytext">Paste official e-Prisons Kara Bazaar portal URL once onboarded.</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setUpdateRecord(null)} className="btn btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary">
                {updateMutation.isPending ? "Updating..." : "Update Status"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
