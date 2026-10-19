import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { PipelineRibbon } from "../charts/PipelineRibbon";
import { ActionSheet, DealSheet, RenewalSheet } from "../components/sheets";
import { ActionRow } from "./Actions";
import { Amount, Due, Empty, Health, Loading, Prio, Row, Status, renewalTone } from "../components/ui";
import { useApi } from "../lib/api";
import { compact, fcfa, longDate, pct, relativeDays } from "../lib/format";
import type { Action, Agenda, Deal, Renewal, Summary } from "../lib/types";

/** Les actions les plus urgentes (en retard d'abord) ; le reste est dans le plan d'actions. */
const ACTIONS_SHOWN = 6;

type Open = { kind: "deal"; item: Deal } | { kind: "action"; item: Action } | { kind: "renewal"; item: Renewal } | null;

export function Overview() {
  const { data: s } = useApi<Summary>("/summary");
  const { data: agenda } = useApi<Agenda>("/agenda?days=7");
  const navigate = useNavigate();
  const [open, setOpen] = useState<Open>(null);

  if (!s) return <div className="page"><Loading height={420} /></div>;
  const p = s.pipeline;
  const b = s.billing;
  const closed = s.by_stage.filter((g) => (g.key === "CLOSED" || g.key === "LOST") && g.count > 0);
  const years = b.years;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="t-caption">{longDate(s.as_of)}</div>
          <h1 className="t-title">Pipeline commercial</h1>
        </div>
        <Link to="/affaires" className="btn">
          Voir les {p.deals_count} affaires
        </Link>
      </div>

      <section className="hero" aria-label="Pipeline par étape">
        <div className="hero-top">
          <div>
            <div className="t-display num hero-figure" title={fcfa(p.total_amount)}>
              {compact(p.total_amount).replace(/\s?M$/, "")}
              <span className="unit">M FCFA</span>
            </div>
            <div className="hero-caption">
              en jeu sur {p.deals_count} affaires, dont {compact(p.weighted_amount)} pondérés par la probabilité de signature
            </div>
          </div>
          <div className="hero-side">
            <div>
              <strong className="num">{p.p1_count}</strong>
              affaires prioritaires
            </div>
            <div>
              <strong className="num">{p.to_qualify_count}</strong>
              encore à qualifier
            </div>
          </div>
        </div>
        <PipelineRibbon stages={s.by_stage} onSelect={(code) => navigate(`/affaires?stage=${code}`)} />
        <div className="ribbon-foot">
          <span>L’épaisseur du ruban suit le montant engagé à chaque étape.</span>
          {closed.map((g) => (
            <span key={g.key}>
              Hors flux : {g.count} {g.label?.toLowerCase()} ({compact(g.amount)})
            </span>
          ))}
        </div>
      </section>

      <section className="figures" aria-label="Indicateurs clés">
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--green)" }} />
            Gagné
          </div>
          <div className="figure-value num" title={fcfa(p.won_amount)}>
            {compact(p.won_amount)}
          </div>
          <div className="figure-note">Affaires signées en M6</div>
        </div>
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--blue)" }} />
            Offres remises ou en signature
          </div>
          <div className="figure-value num" title={fcfa(p.offers_amount)}>
            {compact(p.offers_amount)}
          </div>
          <div className="figure-note">Étapes M4 et M5</div>
        </div>
        <div className="figure">
          <div className="figure-label">Commission</div>
          <div className="figure-value num" title={fcfa(p.commission)}>
            {compact(p.commission)}
          </div>
          <div className="figure-note">{pct(p.profitability)} du montant du pipeline</div>
        </div>
        <div className="figure">
          <div className="figure-label">Reste à encaisser</div>
          <div className="figure-value num" title={fcfa(b.outstanding)}>
            {compact(b.outstanding)}
          </div>
          <div className="figure-note">
            {pct(b.collection_rate)} des {compact(b.invoiced)} facturés depuis {years[0]}
          </div>
          <div className="meter" aria-hidden>
            <span style={{ width: `${(b.collection_rate ?? 0) * 100}%` }} />
          </div>
        </div>
      </section>

      <div className="split section">
        <section aria-labelledby="todo">
          <div className="section-head">
            <h2 className="t-headline" id="todo">
              À traiter cette semaine
            </h2>
            <Link to="/actions" className="t-caption">
              Tout le plan d’actions
            </Link>
          </div>
          {!agenda ? (
            <Loading />
          ) : agenda.actions.length + agenda.renewals.length + agenda.deals.length === 0 ? (
            <div className="group">
              <Empty title="Rien d’urgent cette semaine">Les actions, relances et échéances des 7 prochains jours apparaîtront ici.</Empty>
            </div>
          ) : (
            <>
              {agenda.renewals.length > 0 && (
                <>
                  <div className="group-label">
                    <span>Renouvellements</span>
                    <span className="num">{compact(agenda.renewals.reduce((t, r) => t + (r.last_amount ?? 0), 0))}</span>
                  </div>
                  <div className="group">
                    {agenda.renewals.map((r) => (
                      <Row
                        key={r.id}
                        lead={<Status tone={renewalTone(r.alert)}>{""}</Status>}
                        title={`${r.account_name} — ${r.contract}`}
                        meta={
                          r.due_date
                            ? `${r.alert}, échéance ${relativeDays(r.days_left)} · ${r.status}`
                            : `${r.alert} · ${r.next_action ?? r.status}`
                        }
                        aside={<Amount value={r.last_amount} />}
                        onClick={() => setOpen({ kind: "renewal", item: r })}
                      />
                    ))}
                  </div>
                </>
              )}
              {agenda.actions.length > 0 && (
                <>
                  <div className="group-label" style={{ marginTop: 20 }}>
                    <span>Actions</span>
                    <span className="num">{agenda.actions.length}</span>
                  </div>
                  <div className="group">
                    {/* Cochables ici même : pas besoin d'ouvrir le plan d'actions pour les marquer comme faites. */}
                    {agenda.actions.slice(0, ACTIONS_SHOWN).map((a) => (
                      <ActionRow key={`${a.id}-${a.done}`} action={a} onOpen={() => setOpen({ kind: "action", item: a })} />
                    ))}
                    {agenda.actions.length > ACTIONS_SHOWN && (
                      <Link to="/actions" className="row flush" style={{ minHeight: 44, color: "var(--blue)" }}>
                        Voir les {agenda.actions.length - ACTIONS_SHOWN} autres actions de la semaine
                      </Link>
                    )}
                  </div>
                </>
              )}
              {agenda.deals.length > 0 && (
                <>
                  <div className="group-label" style={{ marginTop: 20 }}>
                    <span>Échéances d’affaires</span>
                    <span className="num">{agenda.deals.length}</span>
                  </div>
                  <div className="group">
                    {agenda.deals.map((d) => (
                      <Row
                        key={d.id}
                        lead={<Status tone={d.overdue ? "bad" : "info"}>{""}</Status>}
                        title={d.title}
                        meta={
                          <>
                            {d.account_name} · <Due date={d.due_date} days={d.days_to_due} />
                          </>
                        }
                        aside={<Amount value={d.amount} />}
                        onClick={() => setOpen({ kind: "deal", item: d })}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="clients">
          <div className="section-head">
            <h2 className="t-headline" id="clients">
              Clients suivis
            </h2>
            <span className="t-caption num">Récurrent annuel {compact(b.recurring_annual)}</span>
          </div>
          <div className="group">
            {s.accounts.map((a) => {
              const values = years.map((y) => a.invoiced_by_year[y] ?? 0);
              const max = Math.max(...s.accounts.flatMap((x) => years.map((y) => x.invoiced_by_year[y] ?? 0)), 1);
              return (
                <Row
                  key={a.id}
                  className="flush"
                  title={a.name}
                  meta={<Health value={a.health} />}
                  aside={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                      <span className="yearbars" title={years.map((y, i) => `${y} : ${fcfa(values[i])}`).join("\n")}>
                        {values.map((v, i) => (
                          <i
                            key={years[i]}
                            className={v === 0 ? "zero" : i === years.length - 1 ? "cur" : ""}
                            style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
                          />
                        ))}
                      </span>
                      <span style={{ minWidth: 64, display: "inline-block" }}>
                        <Amount value={values[values.length - 1]} />
                        <span className="t-caption" style={{ display: "block" }}>
                          facturé {years[years.length - 1]}
                        </span>
                      </span>
                    </span>
                  }
                  onClick={() => navigate(`/comptes/${a.slug}`)}
                />
              );
            })}
          </div>
          {b.expired_count > 0 && (
            <p className="t-caption" style={{ marginTop: 10 }}>
              {b.expired_count} contrats échus non renouvelés, pour {compact(b.expired_amount)} de récurrent annuel.{" "}
              <Link to="/renouvellements">Voir les renouvellements</Link>
            </p>
          )}

          <div className="section-head" style={{ marginTop: 32 }}>
            <h2 className="t-headline">Par responsable</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Responsable</th>
                  <th className="right">Affaires</th>
                  <th className="right">Montant</th>
                  <th className="right">Pondéré</th>
                  <th className="right hide-sm">P1</th>
                </tr>
              </thead>
              <tbody>
                {s.by_lead.map((g) => (
                  <tr key={g.key} onClick={() => navigate(`/affaires?lead=${encodeURIComponent(g.key)}`)}>
                    <td>{g.key}</td>
                    <td className="right num">{g.count}</td>
                    <td className="right">
                      <Amount value={g.amount} />
                    </td>
                    <td className="right">
                      <Amount value={g.weighted_amount} />
                    </td>
                    <td className="right num hide-sm">{g.p1_count || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {open?.kind === "deal" && <DealSheet deal={open.item} onClose={() => setOpen(null)} />}
      {open?.kind === "action" && <ActionSheet action={open.item} onClose={() => setOpen(null)} />}
      {open?.kind === "renewal" && <RenewalSheet renewal={open.item} onClose={() => setOpen(null)} />}
    </div>
  );
}

