import { useState } from "react";
import { IconPlus } from "../components/icons";
import { Pagination, usePaged } from "../components/Pagination";
import { TenderSheet } from "../components/sheets";
import { Amount, Due, Empty, Loading } from "../components/ui";
import { type Page, useApi } from "../lib/api";
import type { Tender } from "../lib/types";

export function Tenders() {
  const { data } = useApi<Page<Tender>>("/tenders?limit=500");
  const [open, setOpen] = useState<Tender | "new" | null>(null);
  const paged = usePaged(data?.results ?? []);
  if (!data) return <div className="page"><Loading /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="t-title">Appels d’offres</h1>
          <p className="lede">Consultations en cours et en veille. Les jours restants avant la date limite de dépôt sont calculés automatiquement.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen("new")}>
          <IconPlus />
          Nouvel appel d’offres
        </button>
      </div>
      {data.results.length === 0 ? (
        <div className="group">
          <Empty title="Aucun appel d’offres suivi">Ajoutez une consultation dès qu’elle est repérée.</Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Organisme</th>
                <th>Étape</th>
                <th>Date limite</th>
                <th className="right">Montant estimé</th>
                <th className="hide-sm">Partenaires</th>
                <th className="hide-sm">Commentaires</th>
              </tr>
            </thead>
            <tbody>
              {paged.items.map((t) => (
                <tr key={t.id} onClick={() => setOpen(t)}>
                  <td className="cell-title">
                    {t.organization}
                    <span className="cell-sub">{t.subject}</span>
                  </td>
                  <td>{t.stage ?? "—"}</td>
                  <td>{t.deadline ? <Due date={t.deadline} days={t.days_left} /> : <span className="muted">À connaître</span>}</td>
                  <td className="right">{t.estimated_amount ? <Amount value={t.estimated_amount} /> : <span className="muted">—</span>}</td>
                  <td className="hide-sm">{t.partners ?? "—"}</td>
                  <td className="hide-sm">
                    <span className="clamp-2 muted">{t.comments ?? "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={paged.page} total={paged.total} onChange={paged.setPage} noun="appels d’offres" />
      {open && <TenderSheet tender={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}
