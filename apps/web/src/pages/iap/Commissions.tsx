import { useState } from "react";
import { IapDealSheet } from "../../components/iap-sheets";
import { Empty, FilterSelect, Loading, Segmented, Status, type Tone, useToast } from "../../components/ui";
import { api, qs, useApi, useSave } from "../../lib/api";
import { compact, date, fcfa, pct } from "../../lib/format";
import { useMe } from "../../lib/me";
import type { IapCommissions, IapDeal } from "../../lib/types";
import { IapStage } from "./Deals";

type StatusFilter = "" | "due" | "paid" | "expected";
const STATUS: Record<Exclude<StatusFilter, "">, { label: string; tone: Tone }> = {
  due: { label: "À verser", tone: "warn" },
  paid: { label: "Versée", tone: "good" },
  expected: { label: "Estimée", tone: "none" },
};
const ROLES = { apport: "Apport", closing: "Closing", apport_closing: "Apport + closing" };

/**
 * Commissions des commerciaux et apporteurs (fiche de commissionnement IAP) : ce que chacun a perçu,
 * ce qui reste à lui verser, et ce qui est estimé sur les affaires en cours.
 */
export function IapCommissionsPage() {
  const me = useMe();
  const [status, setStatus] = useState<StatusFilter>("");
  const [person, setPerson] = useState("");
  const { data } = useApi<IapCommissions>(`/iap/commissions${qs({ status, person })}`, { keepPrevious: true });
  const { data: all } = useApi<IapCommissions>("/iap/commissions");
  const [open, setOpen] = useState<IapDeal | null>(null);
  const save = useSave();
  const toast = useToast();

  const openDeal = async (id: number) => {
    try {
      setOpen(await api.get<IapDeal>(`/iap/deals/${id}`));
    } catch (error) {
      toast((error as Error).message, true);
    }
  };

  const markPaid = (row: IapCommissions["results"][number]) => {
    const field = row.role === "closing" ? "closing_paid_at" : "apport_paid_at";
    save.mutate(
      { method: "patch", path: `/iap/deals/${row.deal_id}`, body: { [field]: me.today } },
      {
        onSuccess: () =>
          toast(`Part de ${row.person} marquée versée`, false, {
            label: "Annuler",
            onClick: () => save.mutate({ method: "patch", path: `/iap/deals/${row.deal_id}`, body: { [field]: null } }),
          }),
        onError: (error) => toast(error.message, true),
      },
    );
  };

  if (!data || !all) return <div className="page"><Loading height={420} /></div>;
  const t = all.totals;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="t-title">Commissions</h1>
          <p className="lede">
            Apporteur {pct(all.policy.apport_rate)}, closeur {pct(all.policy.closing_rate)}, {pct(all.policy.combined_rate)} si la même personne apporte et
            conclut. Les parts se calculent sur la commission effectivement perçue par IAP ; tant qu’elle ne l’est pas, elles sont estimées sur la
            commission attendue.
          </p>
        </div>
      </div>

      <section className="figures" aria-label="Totaux">
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--amber)" }} />À verser
          </div>
          <div className="figure-value num" title={fcfa(t.due)}>
            {compact(t.due)}
          </div>
          <div className="figure-note">Commission perçue par IAP, part non encore versée</div>
        </div>
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--green)" }} />
            Versé
          </div>
          <div className="figure-value num" title={fcfa(t.paid)}>
            {compact(t.paid)}
          </div>
          <div className="figure-note">Parts réglées aux commerciaux et apporteurs</div>
        </div>
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--accent-fill)" }} />
            Estimé
          </div>
          <div className="figure-value num" title={fcfa(t.expected)}>
            {compact(t.expected)}
          </div>
          <div className="figure-note">Sur les commissions attendues des affaires en cours</div>
        </div>
      </section>

      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="t-headline">Par bénéficiaire</h2>
      </div>
      <div className="table-wrap" style={{ marginBottom: 32 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Bénéficiaire</th>
              <th className="right">Affaires</th>
              <th className="right hide-sm">Apport</th>
              <th className="right hide-sm">Closing</th>
              <th className="right hide-sm">Apport + closing</th>
              <th className="right">Total</th>
              <th className="right">Versé</th>
              <th className="right">À verser</th>
            </tr>
          </thead>
          <tbody>
            {all.people.map((p) => (
              <tr key={p.person} onClick={() => setPerson(person === p.person ? "" : p.person)} className={person === p.person ? "selected" : ""}>
                <td className="cell-title">{p.person}</td>
                <td className="right num">{p.deals_count}</td>
                <td className="right num hide-sm" title={fcfa(p.apport)}>
                  {compact(p.apport)}
                </td>
                <td className="right num hide-sm" title={fcfa(p.closing)}>
                  {compact(p.closing)}
                </td>
                <td className="right num hide-sm" title={fcfa(p.combined)}>
                  {compact(p.combined)}
                </td>
                <td className="right num" title={fcfa(p.total)}>
                  {compact(p.total)}
                </td>
                <td className="right num" title={fcfa(p.paid)}>
                  {compact(p.paid)}
                </td>
                <td className={`right num${p.due ? " warn-text" : ""}`} title={fcfa(p.due)}>
                  {compact(p.due)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-head">
        <h2 className="t-headline">Détail par affaire</h2>
      </div>
      <div className="toolbar">
        <Segmented
          label="Statut"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Toutes" },
            { value: "due", label: "À verser" },
            { value: "paid", label: "Versées" },
            { value: "expected", label: "Estimées" },
          ]}
        />
        <FilterSelect label="Bénéficiaire" value={person} onChange={setPerson} options={all.people.map((p) => p.person)} />
        <span className="spacer" />
        <span className="t-caption num">
          {data.results.length} part{data.results.length > 1 ? "s" : ""} · {compact(data.totals.total)} FCFA
        </span>
      </div>
      {data.results.length === 0 ? (
        <div className="group">
          <Empty title="Aucune part de commission">
            {status === "due" ? "Rien à verser : aucune commission perçue en attente de répartition." : "Renseignez l’apporteur et le closeur des affaires."}
          </Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Affaire</th>
                <th>Bénéficiaire</th>
                <th className="hide-sm">Étape</th>
                <th className="right hide-sm">Base</th>
                <th className="right">Part</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={`${r.deal_id}-${r.role}`} onClick={() => openDeal(r.deal_id)}>
                  <td className="cell-title">
                    {r.deal_number}. {r.deal_title}
                  </td>
                  <td>
                    {r.person}
                    <span className="cell-sub">
                      {ROLES[r.role]} · {pct(r.rate)}
                    </span>
                  </td>
                  <td className="hide-sm">
                    <IapStage code={r.stage} />
                  </td>
                  <td className="right hide-sm">
                    <span className="num" title={fcfa(r.base)}>
                      {compact(r.base)}
                    </span>
                    <span className="cell-sub">{r.estimated ? "attendue" : "perçue"}</span>
                  </td>
                  <td className="right num" title={fcfa(r.amount)}>
                    {compact(r.amount)}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <Status tone={STATUS[r.status].tone}>
                        {STATUS[r.status].label}
                        {r.paid_at ? ` le ${date(r.paid_at)}` : ""}
                      </Status>
                      {r.status === "due" && (
                        <button type="button" className="btn btn-plain" onClick={() => markPaid(r)} disabled={save.isPending}>
                          Marquer versée
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <IapDealSheet deal={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
