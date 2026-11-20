import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { FinDealSheet } from "../../components/fin-sheets";
import { IconGrid, IconList, IconPlus } from "../../components/icons";
import { Pagination, usePaged } from "../../components/Pagination";
import { Amount, Due, Empty, FilterSelect, Loading, Search, Segmented, Stage, useToast } from "../../components/ui";
import { type Page, qs, useApi, useSave } from "../../lib/api";
import { useBoardDrag } from "../../lib/board-drag";
import { useDeepLink } from "../../lib/deeplink";
import { compact, fcfa, pct } from "../../lib/format";
import { useSpace } from "../../lib/space";
import { FIN_NATURES, FIN_SECTORS, FIN_STAGES, type FinDeal } from "../../lib/types";

type SortKey = "priority" | "number" | "stage" | "amount" | "revenue" | "weighted_revenue" | "outstanding" | "due_date";
const STAGE_ORDER = FIN_STAGES.map((s) => s.code as string);

function sortValue(d: FinDeal, key: SortKey): number | string | null {
  if (key === "stage") return STAGE_ORDER.indexOf(d.stage);
  return d[key] ?? null;
}

/** Jauge d'étape IAC / IAF (F0 → F5). */
export function FinStage({ code }: { code: string | null }) {
  return <Stage code={code} stages={FIN_STAGES} flow={6} wonCode="F5" />;
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === column;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className={`sort${active ? " on" : ""}`} onClick={() => onSort(column)}>
        {label}
        <span aria-hidden>{active ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
      </button>
    </th>
  );
}

const DESC_FIRST: SortKey[] = ["amount", "revenue", "weighted_revenue", "outstanding"];

/** Affaires d'IAC ou d'IAF : liste triable ou colonnes par étape. */
export function FinDeals() {
  const space = useSpace();
  const [params, setParams] = useSearchParams();
  const view = params.get("vue") === "etapes" ? "board" : "list";
  const filters = {
    q: params.get("q") ?? "",
    stage: params.get("stage") ?? "",
    nature: params.get("nature") ?? "",
    sector: params.get("domaine") ?? "",
    outstanding: params.get("encaisser") ?? "",
  };
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const { data, isLoading } = useApi<Page<FinDeal>>(
    `${space.api}/deals${qs({
      q: filters.q,
      stage: view === "board" ? "" : filters.stage,
      nature: filters.nature,
      sector: filters.sector,
      outstanding: filters.outstanding ? "true" : "",
      limit: 500,
    })}`,
    { keepPrevious: true },
  );
  const [open, setOpen] = useState<FinDeal | "new" | null>(null);
  const clearLink = useDeepLink<FinDeal>("affaire", (n) => `${space.api}/deals?number=${n}`, setOpen);
  const deals = data?.results ?? [];
  const total = deals.reduce((t, d) => t + (d.amount ?? 0), 0);
  const revenue = deals.reduce((t, d) => t + (d.revenue ?? 0), 0);
  const weighted = deals.reduce((t, d) => t + (d.weighted_revenue ?? 0), 0);
  const outstanding = deals.reduce((t, d) => t + d.outstanding, 0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "priority", dir: 1 });
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: DESC_FIRST.includes(key) ? -1 : 1 }));
  const sorted = useMemo(
    () =>
      [...deals].sort((a, b) => {
        const x = sortValue(a, sort.key);
        const y = sortValue(b, sort.key);
        if (x === y) return a.number - b.number;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * sort.dir;
      }),
    [deals, sort],
  );
  const paged = usePaged(sorted, JSON.stringify(filters) + sort.key + sort.dir);
  const filtered = Object.values(filters).some(Boolean);
  const clearFilters = () => {
    const next = new URLSearchParams();
    if (view === "board") next.set("vue", "etapes");
    setParams(next, { replace: true });
  };

  return (
    <div className="page" style={{ maxWidth: view === "board" ? "none" : undefined }}>
      <div className="page-head">
        <div>
          <h1 className="t-title">Affaires</h1>
          <p className="lede">
            {deals.length} affaire{deals.length > 1 ? "s" : ""} pour <span className="num">{compact(total)}</span> FCFA demandés, soit{" "}
            <span className="num">{compact(revenue)}</span> de revenus attendus (honoraires et commissions) dont <span className="num">{compact(weighted)}</span>{" "}
            pondérés.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen("new")}>
          <IconPlus />
          Nouvelle affaire
        </button>
      </div>

      <div className="toolbar">
        <Segmented
          label="Affichage"
          value={view}
          onChange={(v) => set("vue", v === "board" ? "etapes" : "")}
          options={[
            { value: "list", label: <><IconList width={15} /> Liste</> },
            { value: "board", label: <><IconGrid width={15} /> Étapes</> },
          ]}
        />
        <Search value={filters.q} onChange={(v) => set("q", v)} placeholder="Rechercher une entreprise, un domaine, une étape…" />
        {view === "list" && (
          <FilterSelect label="Étape" value={filters.stage} onChange={(v) => set("stage", v)} options={FIN_STAGES.map((s) => ({ value: s.code, label: s.label }))} />
        )}
        <FilterSelect label="Nature" value={filters.nature} onChange={(v) => set("nature", v)} options={FIN_NATURES} />
        <FilterSelect label="Domaine" value={filters.sector} onChange={(v) => set("domaine", v)} options={FIN_SECTORS} />
        <FilterSelect label="Encaissement" value={filters.outstanding} onChange={(v) => set("encaisser", v)} options={[{ value: "1", label: "Reste à encaisser" }]} />
        {filtered && (
          <button type="button" className="btn btn-plain" onClick={clearFilters}>
            Effacer les filtres
          </button>
        )}
      </div>
      {view === "board" && (
        <p className="t-caption" style={{ margin: "-6px 0 12px" }}>
          Glissez une carte d’une colonne à l’autre pour changer son étape ; cliquez-la pour l’ouvrir.
        </p>
      )}

      {isLoading ? (
        <Loading height={480} />
      ) : deals.length === 0 ? (
        <div className="group">
          <Empty title={filtered ? "Aucune affaire ne correspond" : "Aucune affaire pour l’instant"}>
            <p style={{ margin: "4px 0 12px" }}>{filtered ? "Modifiez la recherche ou retirez un filtre." : "Créez la première avec « Nouvelle affaire »."}</p>
            {filtered && (
              <button type="button" className="btn" onClick={clearFilters}>
                Effacer les filtres
              </button>
            )}
          </Empty>
        </div>
      ) : view === "board" ? (
        <Board deals={deals} onOpen={setOpen} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <SortHeader label="N°" column="number" sort={sort} onSort={onSort} className="right" />
                <th>Entreprise ou projet</th>
                <SortHeader label="Étape" column="stage" sort={sort} onSort={onSort} />
                <SortHeader label="Montant" column="amount" sort={sort} onSort={onSort} className="right" />
                <SortHeader label="Revenu attendu" column="revenue" sort={sort} onSort={onSort} className="right" />
                <SortHeader label="Pondéré" column="weighted_revenue" sort={sort} onSort={onSort} className="right hide-sm" />
                <SortHeader label="À encaisser" column="outstanding" sort={sort} onSort={onSort} className="right hide-sm" />
                <SortHeader label="Closing estimé" column="due_date" sort={sort} onSort={onSort} className="hide-sm" />
                <th className="hide-sm">Prochaine étape</th>
              </tr>
            </thead>
            <tbody>
              {paged.items.map((d) => (
                <tr key={d.id} onClick={() => setOpen(d)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(d)}>
                  <td className="right num muted">{d.number}</td>
                  <td className="cell-title">
                    {d.title}
                    <span className="cell-sub">{[d.nature, d.sector, d.owner].filter(Boolean).join(" · ") || "—"}</span>
                  </td>
                  <td>
                    <FinStage code={d.stage} />
                  </td>
                  <td className="right">
                    <Amount value={d.amount} />
                    {d.closing != null && d.is_open && <span className="cell-sub num">{Math.round(d.closing * 100)} %</span>}
                  </td>
                  <td className="right">
                    <Amount value={d.revenue} />
                    <span className="cell-sub num">
                      {[d.fee != null ? `hon. ${compact(d.fee)}` : null, d.commission_rate != null ? pct(d.commission_rate) : null].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="right hide-sm">
                    <Amount value={d.weighted_revenue} />
                  </td>
                  <td className="right hide-sm">{d.outstanding > 0 ? <Amount value={d.outstanding} className="warn-text" /> : <span className="muted">—</span>}</td>
                  <td className="hide-sm">{d.due_date ? <Due date={d.due_date} days={d.days_to_due} done={!d.is_open} /> : <span className="muted">—</span>}</td>
                  <td className="hide-sm">
                    <span className="clamp-2 muted">{d.next_step ?? "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td>{paged.total > paged.size ? `Total des ${paged.total} affaires` : "Total"}</td>
                <td />
                <td className="right num" title={fcfa(total)}>
                  {compact(total)}
                </td>
                <td className="right num" title={fcfa(revenue)}>
                  {compact(revenue)}
                </td>
                <td className="right num hide-sm" title={fcfa(weighted)}>
                  {compact(weighted)}
                </td>
                <td className="right num hide-sm" title={fcfa(outstanding)}>
                  {compact(outstanding)}
                </td>
                <td className="hide-sm" />
                <td className="hide-sm" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {view === "list" && <Pagination page={paged.page} total={paged.total} onChange={paged.setPage} noun="affaires" />}

      {open && (
        <FinDealSheet
          deal={open === "new" ? null : open}
          defaults={filters.stage ? { stage: filters.stage as FinDeal["stage"] } : undefined}
          onClose={() => {
            setOpen(null);
            clearLink();
          }}
        />
      )}
    </div>
  );
}

/** Une colonne par étape ; glisser une carte change l'étape de l'affaire. */
function Board({ deals, onOpen }: { deals: FinDeal[]; onOpen: (d: FinDeal) => void }) {
  const space = useSpace();
  const save = useSave();
  const toast = useToast();
  const [moved, setMoved] = useState<Record<number, string>>({});
  const laneOf = (d: FinDeal) => moved[d.id] ?? d.stage;

  const drop = (id: number, stage: string) => {
    const deal = deals.find((d) => d.id === id);
    if (!deal || laneOf(deal) === stage) return;
    setMoved((m) => ({ ...m, [deal.id]: stage }));
    const label = FIN_STAGES.find((s) => s.code === stage)?.label;
    const body: Record<string, unknown> = { stage };
    if (stage === "F4" || stage === "F5") body.closing = 1;
    if (stage === "LOST") body.closing = 0;
    save.mutate(
      { method: "patch", path: `${space.api}/deals/${deal.id}`, body },
      {
        onSuccess: () => toast(`« ${deal.title} » passe en ${label}`),
        onError: (error) => {
          setMoved((m) => {
            const { [deal.id]: _, ...rest } = m;
            return rest;
          });
          toast(error.message, true);
        },
      },
    );
  };

  const { dragging, over, cardProps, laneProps } = useBoardDrag({
    laneOf: (id) => {
      const deal = deals.find((d) => d.id === id);
      return deal ? laneOf(deal) : "";
    },
    onDrop: drop,
  });

  return (
    <div className="board">
      {FIN_STAGES.map((lane) => {
        const items = deals.filter((d) => laneOf(d) === lane.code);
        const sum = items.reduce((t, d) => t + (d.revenue ?? 0), 0);
        return (
          <section key={lane.code} className={`lane${over === lane.code ? " over" : ""}`} aria-label={lane.label} {...laneProps(lane.code)}>
            <div className="lane-head">
              <span className="t-caption">{lane.code === "LOST" ? "Sortie" : lane.code}</span>
              <strong>{lane.short}</strong>
              <span className="num" title="Nombre d’affaires · revenus attendus">
                {items.length} · {compact(sum)}
              </span>
            </div>
            {items.map((d) => (
              <button key={d.id} type="button" className={`card${dragging === d.id ? " dragging" : ""}`} {...cardProps(d.id)} onClick={() => onOpen(d)}>
                <div className="card-title">{d.title}</div>
                <div className="card-account">{[d.nature, d.sector].filter(Boolean).join(" · ")}</div>
                <div className="card-foot">
                  <span className="t-caption num">
                    {d.outstanding > 0 ? `${compact(d.outstanding)} à encaisser` : d.revenue != null ? `${compact(d.revenue)} attendus` : "Revenu à définir"}
                  </span>
                  <Amount value={d.amount} />
                </div>
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
