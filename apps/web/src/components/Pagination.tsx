import { useEffect, useState } from "react";
import { IconBack, IconChevron } from "./icons";

/** Nombre de lignes par page dans toutes les vues en liste. */
export const PAGE_SIZE = 25;

/**
 * Découpe en pages une liste déjà chargée. La page revient à 1 quand `resetKey` change
 * (nouvelle recherche, nouveau filtre).
 */
export function usePaged<T>(items: T[], resetKey = "", size = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages);
  return {
    page: current,
    setPage,
    items: items.slice((current - 1) * size, current * size),
    total: items.length,
    size,
  };
}

/** Numéros affichés : la première et la dernière page, et les voisines de la page courante. */
function pageNumbers(page: number, pages: number): (number | "…")[] {
  const shown = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...shown].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

export function Pagination({
  page,
  total,
  size = PAGE_SIZE,
  onChange,
  noun = "éléments",
}: {
  page: number;
  total: number;
  size?: number;
  onChange: (page: number) => void;
  noun?: string;
}) {
  if (total <= size) return null;
  const pages = Math.ceil(total / size);
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const go = (next: number) => {
    onChange(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="t-caption num">
        {from}–{to} sur {total} {noun}
      </span>
      <div className="pager">
        <button type="button" className="btn btn-plain icon-btn" disabled={page === 1} onClick={() => go(page - 1)} aria-label="Page précédente">
          <IconBack />
        </button>
        {pageNumbers(page, pages).map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="page-gap" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={`page-btn num${n === page ? " on" : ""}`}
              aria-current={n === page ? "page" : undefined}
              aria-label={`Page ${n}`}
              onClick={() => go(n)}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" className="btn btn-plain icon-btn" disabled={page === pages} onClick={() => go(page + 1)} aria-label="Page suivante">
          <IconChevron />
        </button>
      </div>
    </nav>
  );
}
