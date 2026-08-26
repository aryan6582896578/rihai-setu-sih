import { useMemo, useState } from "react";

export const PAGE_SIZE = 10;

/** Client-side search + pagination shared by list views. */
export function useSearchPage<T>(rows: T[], haystack: (r: T) => string) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => haystack(r).toLowerCase().includes(needle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return {
    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(1);
    },
    page: safePage,
    setPage,
    totalPages,
    total: filtered.length,
    paged,
  };
}

export function SearchPagination({
  q,
  setQ,
  page,
  setPage,
  totalPages,
  total,
  noun,
}: {
  q: string;
  setQ: (v: string) => void;
  page: number;
  setPage: (p: number) => void;
  totalPages: number;
  total: number;
  noun: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${noun}…`}
        className="input-base w-full sm:max-w-xs"
      />
      <span className="text-xs font-semibold text-bodytext">
        {total} {total === 1 ? noun.replace(/s$/, "") : noun}
      </span>
      {totalPages > 1 && (
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="btn btn-outline btn-sm disabled:opacity-40">
            ← Prev
          </button>
          <span className="text-xs font-bold text-navy">
            Page {page} / {totalPages}
          </span>
          <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="btn btn-outline btn-sm disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
