import { useState } from "react";
import { useSearchParams } from "react-router";
import { PartnerSheet } from "../../components/fin-sheets";
import { IconPlus } from "../../components/icons";
import { Pagination, usePaged } from "../../components/Pagination";
import { Amount, Due, Empty, FilterSelect, Loading, Prio, Search } from "../../components/ui";
import { type Page, qs, useApi } from "../../lib/api";
import { useDeepLink } from "../../lib/deeplink";
import { PARTNER_ENTITIES, PARTNER_POTENTIALS, type Partner } from "../../lib/types";

const POTENTIAL_CLASS = { Élevé: "high", Moyen: "medium", Faible: "low" } as const;

/** Potentiel commercial : même pastille que la facilité de commercialisation d'IAP. */
function Potential({ value }: { value: Partner["potential"] }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={`ease ${POTENTIAL_CLASS[value]}`}>{value}</span>;
}

/** Cartographie des partenaires stratégiques du groupe, avec leur prochaine action. */
export function PartnersPage() {
  const [params, setParams] = useSearchParams();
  const filters = {
    q: params.get("q") ?? "",
    entity: params.get("entite") ?? "",
    potential: params.get("potentiel") ?? "",
    priority: params.get("priorite") ?? "",
    overdue: params.get("retard") ?? "",
  };
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const { data, isLoading } = useApi<Page<Partner>>(
    `/groupe/partners${qs({ q: filters.q, entity: filters.entity, potential: filters.potential, priority: filters.priority, overdue: filters.overdue ? "true" : "", limit: 500 })}`,
    { keepPrevious: true },
  );
  const [open, setOpen] = useState<Partner | "new" | null>(null);
  const clearLink = useDeepLink<Partner>("partenaire", (id) => `/groupe/partners/${id}`, setOpen);
  const partners = data?.results ?? [];
  const paged = usePaged(partners, JSON.stringify(filters));
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="t-title">Partenaires</h1>
          <p className="lede">
            Partenaires stratégiques du groupe : potentiel commercial, référents et prochaine action. {partners.filter((p) => p.overdue).length} échéance
            {partners.filter((p) => p.overdue).length > 1 ? "s" : ""} dépassée{partners.filter((p) => p.overdue).length > 1 ? "s" : ""}.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen("new")}>
          <IconPlus />
          Nouveau partenaire
        </button>
      </div>
      <div className="toolbar">
        <Search value={filters.q} onChange={(v) => set("q", v)} placeholder="Partenaire, expertise, référent, opportunité…" />
        <FilterSelect label="Entité" value={filters.entity} onChange={(v) => set("entite", v)} options={[...PARTNER_ENTITIES]} />
        <FilterSelect label="Potentiel" value={filters.potential} onChange={(v) => set("potentiel", v)} options={[...PARTNER_POTENTIALS]} />
        <FilterSelect label="Priorité" value={filters.priority} onChange={(v) => set("priorite", v)} options={["P1", "P2", "P3"]} />
        <FilterSelect label="Échéance" value={filters.overdue} onChange={(v) => set("retard", v)} options={[{ value: "1", label: "Dépassée" }]} />
        {filtered && (
          <button type="button" className="btn btn-plain" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Effacer les filtres
          </button>
        )}
      </div>

      {isLoading ? (
        <Loading height={420} />
      ) : partners.length === 0 ? (
        <div className="group">
          <Empty title={filtered ? "Aucun partenaire ne correspond" : "Aucun partenaire pour l’instant"}>
            {filtered ? "Modifiez la recherche ou retirez un filtre." : "Ajoutez le premier avec « Nouveau partenaire »."}
          </Empty>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Partenaire</th>
                  <th>Entité</th>
                  <th>Potentiel</th>
                  <th className="hide-sm">Référent IAG</th>
                  <th className="hide-sm">Prochaine action</th>
                  <th>Échéance</th>
                  <th className="right hide-sm">CA potentiel</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((p) => (
                  <tr key={p.id} onClick={() => setOpen(p)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(p)}>
                    <td className="cell-title">
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <Prio value={p.priority} />
                        {p.name}
                      </span>
                      <span className="cell-sub">{[p.type, p.zone].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td>{p.entity}</td>
                    <td>
                      <Potential value={p.potential} />
                    </td>
                    <td className="hide-sm">{p.iag_referent ?? <span className="muted">—</span>}</td>
                    <td className="hide-sm">
                      <span className="clamp-2 muted">{p.next_action ?? "—"}</span>
                    </td>
                    <td>{p.due_date ? <Due date={p.due_date} days={p.days_to_due} /> : <span className="muted">—</span>}</td>
                    <td className="right hide-sm">{p.potential_revenue ? <Amount value={p.potential_revenue} /> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={paged.page} total={paged.total} onChange={paged.setPage} noun="partenaires" />
        </>
      )}

      {open && (
        <PartnerSheet
          partner={open === "new" ? null : open}
          defaults={filters.entity ? { entity: filters.entity } : undefined}
          onClose={() => {
            setOpen(null);
            clearLink();
          }}
        />
      )}
    </div>
  );
}
