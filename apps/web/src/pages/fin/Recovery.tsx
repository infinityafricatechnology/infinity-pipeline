import { useState } from "react";
import { FinDealSheet } from "../../components/fin-sheets";
import { Amount, Empty, Loading } from "../../components/ui";
import { type Page, useApi } from "../../lib/api";
import { compact, date, fcfa } from "../../lib/format";
import { useSpace } from "../../lib/space";
import type { FinDeal, FinRecovery } from "../../lib/types";
import { FinStage } from "./Deals";

/**
 * Encaissements d'IAC ou d'IAF : honoraires et commissions de succès reçus et restant à recouvrer, affaire
 * par affaire. Saisir un encaissement se fait dans la fiche de l'affaire.
 */
export function FinRecoveryPage() {
  const space = useSpace();
  const { data, isLoading } = useApi<FinRecovery>(`${space.api}/recovery`);
  const { data: deals } = useApi<Page<FinDeal>>(`${space.api}/deals?limit=500`);
  const [open, setOpen] = useState<FinDeal | null>(null);
  const openDeal = (id: number) => {
    const deal = deals?.results.find((d) => d.id === id);
    if (deal) setOpen(deal);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="t-title">Encaissements</h1>
          <p className="lede">
            Honoraires facturés et commissions de succès dues une fois le financement obtenu. Ouvrez une affaire pour enregistrer un encaissement.
          </p>
        </div>
      </div>

      {isLoading || !data ? (
        <Loading height={360} />
      ) : (
        <>
          <section className="figures" aria-label="Totaux">
            <div className="figure">
              <div className="figure-label">
                <i style={{ background: "var(--amber)" }} />
                Reste à encaisser
              </div>
              <div className="figure-value num" title={fcfa(data.totals.outstanding)}>
                {compact(data.totals.outstanding)}
              </div>
              <div className="figure-note">Honoraires et commissions</div>
            </div>
            <div className="figure">
              <div className="figure-label">Honoraires dus</div>
              <div className="figure-value num" title={fcfa(data.totals.fee_outstanding)}>
                {compact(data.totals.fee_outstanding)}
              </div>
              <div className="figure-note">Forfaits fixés non encore réglés</div>
            </div>
            <div className="figure">
              <div className="figure-label">Commissions dues</div>
              <div className="figure-value num" title={fcfa(data.totals.commission_outstanding)}>
                {compact(data.totals.commission_outstanding)}
              </div>
              <div className="figure-note">Sur les financements obtenus</div>
            </div>
            <div className="figure">
              <div className="figure-label">
                <i style={{ background: "var(--green)" }} />
                Déjà encaissé
              </div>
              <div className="figure-value num" title={fcfa(data.totals.received)}>
                {compact(data.totals.received)}
              </div>
              <div className="figure-note">Toutes affaires confondues</div>
            </div>
          </section>

          {data.results.length === 0 ? (
            <div className="group section">
              <Empty title="Rien à encaisser">Les honoraires fixés et les commissions des financements obtenus apparaîtront ici.</Empty>
            </div>
          ) : (
            <div className="table-wrap section">
              <table className="table">
                <thead>
                  <tr>
                    <th>Affaire</th>
                    <th>Étape</th>
                    <th className="right">Honoraire dû</th>
                    <th className="right">Commission due</th>
                    <th className="right">Total dû</th>
                    <th className="right hide-sm">Encaissé</th>
                    <th className="hide-sm">Prochaine étape</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.deal_id} onClick={() => openDeal(r.deal_id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openDeal(r.deal_id)}>
                      <td className="cell-title">
                        {r.deal_title}
                        <span className="cell-sub">{[`n° ${r.deal_number}`, r.owner].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td>
                        <FinStage code={r.stage} />
                      </td>
                      <td className="right">
                        {r.fee_outstanding > 0 ? <Amount value={r.fee_outstanding} /> : <span className="muted">—</span>}
                        {r.fee != null && <span className="cell-sub num">sur {compact(r.fee)}</span>}
                      </td>
                      <td className="right">
                        {r.commission_outstanding > 0 ? <Amount value={r.commission_outstanding} /> : <span className="muted">—</span>}
                        {r.commission != null && r.commission_outstanding > 0 && <span className="cell-sub num">sur {compact(r.commission)}</span>}
                      </td>
                      <td className="right">{r.outstanding > 0 ? <Amount value={r.outstanding} className="warn-text" /> : <span className="muted">Soldé</span>}</td>
                      <td className="right hide-sm">
                        <Amount value={r.fee_received + r.commission_received} />
                        {(r.commission_received_at ?? r.fee_received_at) && (
                          <span className="cell-sub">le {date(r.commission_received_at ?? r.fee_received_at)}</span>
                        )}
                      </td>
                      <td className="hide-sm">
                        <span className="clamp-2 muted">{r.next_step ?? "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {open && <FinDealSheet deal={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
