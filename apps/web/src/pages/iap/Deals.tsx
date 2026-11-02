import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { IconGrid, IconList, IconPlus } from "../../components/icons";
import { IapDealSheet } from "../../components/iap-sheets";
import { Pagination, usePaged } from "../../components/Pagination";
import { Amount, Due, Empty, FilterSelect, Loading, Search, Segmented, Stage, useToast } from "../../components/ui";
import { type Page, qs, useApi, useSave } from "../../lib/api";
import { useDeepLink } from "../../lib/deeplink";
import { compact, fcfa, pct } from "../../lib/format";
import { IAP_NATURES, IAP_PEOPLE, IAP_STAGES, type IapDeal } from "../../lib/types";

type SortKey = "number" | "stage" | "amount" | "commission" | "weighted_commission" | "due_date";
const STAGE_ORDER = IAP_STAGES.map((s) => s.code as string);

function sortValue(d: IapDeal, key: SortKey): number | string | null {
  if (key === "stage") return STAGE_ORDER.indexOf(d.stage);
  return d[key] ?? null;
}

/** Jauge d'étape aux étapes immobilières (P0 → P5). */
export function IapStage({ code }: { code: string | null }) {
  return <Stage code={code} stages={IAP_STAGES} flow={6} wonCode="P5" />;
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

export function IapDeals() {
  const [params, setParams] = useSearchParams();
  const view = params.get("vue") === "etapes" ? "board" : "list";
  const filters = {
    q: params.get("q") ?? "",
    stage: params.get("stage") ?? "",
    nature: params.get("nature") ?? "",
    person: params.get("personne") ?? "",
  };
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const { data, isLoading } = useApi<Page<IapDeal>>(
    `/iap/deals${qs({ q: filters.q, stage: view === "board" ? "" : filters.stage, nature: filters.nature, person: filters.person, limit: 500 })}`,
    { keepPrevious: true },
  );
  const [open, setOpen] = useState<IapDeal | "new" | null>(null);
  const clearLink = useDeepLink<IapDeal>("affaire", (n) => `/iap/deals?number=${n}`, setOpen);
  const deals = data?.results ?? [];
  const total = deals.reduce((t, d) => t + (d.amount ?? 0), 0);
  const commission = deals.reduce((t, d) => t + (d.commission ?? 0), 0);
  const weighted = deals.reduce((t, d) => t + (d.weighted_commission ?? 0), 0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "number", dir: 1 });
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: ["amount", "commission", "weighted_commission"].includes(key) ? -1 : 1 }));
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
            {deals.length} affaire{deals.length > 1 ? "s" : ""} pour <span className="num">{compact(total)}</span> FCFA de biens, soit{" "}
            <span className="num">{compact(commission)}</span> de commissions attendues dont <span className="num">{compact(weighted)}</span> pondérés.
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
        <Search value={filters.q} onChange={(v) => set("q", v)} placeholder="Rechercher un bien, un client, un commercial…" />
        {view === "list" && (
          <FilterSelect label="Étape" value={filters.stage} onChange={(v) => set("stage", v)} options={IAP_STAGES.map((s) => ({ value: s.code, label: s.label }))} />
        )}
        <FilterSelect label="Nature" value={filters.nature} onChange={(v) => set("nature", v)} options={IAP_NATURES} />
        <FilterSelect label="Commercial" value={filters.person} onChange={(v) => set("personne", v)} options={IAP_PEOPLE} />
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
                <th>Bien ou projet</th>
                <SortHeader label="Étape" column="stage" sort={sort} onSort={onSort} />
                <SortHeader label="Montant" column="amount" sort={sort} onSort={onSort} className="right" />
                <SortHeader label="Commission" column="commission" sort={sort} onSort={onSort} className="right" />
                <SortHeader label="Pondérée" column="weighted_commission" sort={sort} onSort={onSort} className="right hide-sm" />
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
                    <span className="cell-sub">{[d.nature, d.apporteur].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td>
                    <IapStage code={d.stage} />
                  </td>
                  <td className="right">
                    <Amount value={d.amount} />
                    {d.closing != null && d.is_open && <span className="cell-sub num">{Math.round(d.closing * 100)} %</span>}
                  </td>
                  <td className="right">
                    <Amount value={d.commission} />
                    {d.commission_rate != null && <span className="cell-sub num">{pct(d.commission_rate)}</span>}
                  </td>
                  <td className="right hide-sm">
                    <Amount value={d.weighted_commission} />
                  </td>
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
                <td className="right num" title={fcfa(commission)}>
                  {compact(commission)}
                </td>
                <td className="right num hide-sm" title={fcfa(weighted)}>
                  {compact(weighted)}
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
        <IapDealSheet
          deal={open === "new" ? null : open}
          defaults={{
            ...(filters.stage ? { stage: filters.stage as IapDeal["stage"] } : {}),
            ...(filters.person ? { apporteur: filters.person, closeur: filters.person } : {}),
          }}
          onClose={() => {
            setOpen(null);
            clearLink();
          }}
        />
      )}
    </div>
  );
}

/** Une colonne par étape immobilière ; glisser une carte change l'étape de l'affaire. */
function Board({ deals, onOpen }: { deals: IapDeal[]; onOpen: (d: IapDeal) => void }) {
  const save = useSave();
  const toast = useToast();
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<number, string>>({});
  const laneOf = (d: IapDeal) => moved[d.id] ?? d.stage;

  const drop = (stage: string) => {
    const deal = deals.find((d) => d.id === dragging);
    setOver(null);
    setDragging(null);
    if (!deal || laneOf(deal) === stage) return;
    setMoved((m) => ({ ...m, [deal.id]: stage }));
    const label = IAP_STAGES.find((s) => s.code === stage)?.label;
    const body: Record<string, unknown> = { stage };
    if (stage === "P5") body.closing = 1;
    if (stage === "LOST") body.closing = 0;
    save.mutate(
      { method: "patch", path: `/iap/deals/${deal.id}`, body },
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

  return (
    <div className="board">
      {IAP_STAGES.map((lane) => {
        const items = deals.filter((d) => laneOf(d) === lane.code);
        const sum = items.reduce((t, d) => t + (d.commission ?? 0), 0);
        return (
          <section
            key={lane.code}
            className={`lane${over === lane.code ? " over" : ""}`}
            aria-label={lane.label}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(lane.code);
            }}
            onDragLeave={() => setOver((o) => (o === lane.code ? null : o))}
            onDrop={() => drop(lane.code)}
          >
            <div className="lane-head">
              <span className="t-caption">{lane.code === "LOST" ? "Sortie" : lane.code}</span>
              <strong>{lane.short}</strong>
              <span className="num" title="Nombre d’affaires · commissions attendues">
                {items.length} · {compact(sum)}
              </span>
            </div>
            {items.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`card${dragging === d.id ? " dragging" : ""}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(d.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                onClick={() => onOpen(d)}
              >
                <div className="card-title">{d.title}</div>
                <div className="card-account">{[d.nature, d.apporteur].filter(Boolean).join(" · ")}</div>
                <div className="card-foot">
                  <span className="t-caption num">{d.commission != null ? `${compact(d.commission)} comm.` : "Comm. à définir"}</span>
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
