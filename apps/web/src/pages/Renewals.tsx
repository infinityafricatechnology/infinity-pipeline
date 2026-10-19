import { useState } from "react";
import { RenewalTimeline } from "../charts/RenewalTimeline";
import { IconPlus } from "../components/icons";
import { Pagination, usePaged } from "../components/Pagination";
import { RenewalSheet } from "../components/sheets";
import { Amount, Loading, Status, renewalTone } from "../components/ui";
import { type Page, useApi } from "../lib/api";
import { useDeepLink } from "../lib/deeplink";
import { compact, date, relativeDays } from "../lib/format";
import type { Me, Renewal } from "../lib/types";

export function Renewals() {
  const { data } = useApi<Page<Renewal>>("/renewals?limit=500");
  const { data: me } = useApi<Me>("/me");
  const [open, setOpen] = useState<Renewal | "new" | null>(null);
  const clearLink = useDeepLink<Renewal>("contrat", (id) => `/renewals/${id}`, setOpen);
  const paged = usePaged(data?.results ?? []);
  if (!data || !me) return <div className="page"><Loading height={400} /></div>;
  const renewals = data.results;
  const recurring = renewals.reduce((t, r) => t + (r.last_amount ?? 0), 0);
  const expired = renewals.filter((r) => r.alert === "Échu - urgent");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="t-title">Renouvellements</h1>
          <p className="lede">
            <span className="num">{compact(recurring)}</span> FCFA de récurrent annuel sur {renewals.length} contrats.{" "}
            {expired.length > 0 && (
              <>
                {expired.length} contrats sont échus sans renouvellement, pour <span className="num">{compact(expired.reduce((t, r) => t + (r.last_amount ?? 0), 0))}</span>.
              </>
            )}{" "}
            Échéance = dernière facturation + 12 mois ; relance à J-90 puis J-30.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen("new")}>
          <IconPlus />
          Nouveau contrat
        </button>
      </div>

      <section className="panel" aria-label="Échéancier">
        <RenewalTimeline renewals={renewals} today={me.today} onSelect={setOpen} />
      </section>

      <div className="section">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Contrat</th>
                <th>Alerte</th>
                <th>Échéance</th>
                <th className="hide-sm">Relance J-90</th>
                <th className="right">Montant</th>
                <th className="hide-sm">Statut</th>
                <th className="hide-sm">Prochaine action</th>
              </tr>
            </thead>
            <tbody>
              {paged.items.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(r)}>
                  <td className="cell-title">
                    {r.account_name}
                    <span className="cell-sub">{r.contract}</span>
                  </td>
                  <td>
                    <Status tone={renewalTone(r.alert)}>{r.alert}</Status>
                  </td>
                  <td className="nowrap">
                    {date(r.due_date, true)}
                    {r.days_left != null && <span className="cell-sub">{relativeDays(r.days_left)}</span>}
                  </td>
                  <td className="hide-sm nowrap">{date(r.reminder_90, true)}</td>
                  <td className="right">
                    <Amount value={r.last_amount} />
                  </td>
                  <td className="hide-sm">{r.status}</td>
                  <td className="hide-sm">
                    <span className="clamp-2 muted">{r.next_action ?? "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={paged.page} total={paged.total} onChange={paged.setPage} noun="contrats" />
      </div>
      {open && <RenewalSheet renewal={open === "new" ? null : open} onClose={() => {
            setOpen(null);
            clearLink();
          }} />}
    </div>
  );
}
