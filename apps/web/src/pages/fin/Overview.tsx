import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { PipelineRibbon } from "../../charts/PipelineRibbon";
import { FinActionSheet, FinDealSheet } from "../../components/fin-sheets";
import { Amount, Due, Empty, Loading, Row, Status } from "../../components/ui";
import { useApi } from "../../lib/api";
import { compact, fcfa, longDate } from "../../lib/format";
import { useSpace } from "../../lib/space";
import { FIN_FLOW_STAGES, type FinAction, type FinAgenda, type FinDeal, type FinSummary } from "../../lib/types";
import { ActionRow } from "../Actions";

const ACTIONS_SHOWN = 6;

type Open = { kind: "deal"; item: FinDeal } | { kind: "action"; item: FinAction } | null;

const TITLES = { iac: "Mobilisation de capitaux", iaf: "Pipeline de financement" } as const;

/** Vue d'ensemble d'IAC ou d'IAF : montants recherchés, revenus attendus, encaissements, ce qui est à traiter. */
export function FinOverview() {
  const space = useSpace();
  const { data: s } = useApi<FinSummary>(`${space.api}/summary`);
  const { data: agenda } = useApi<FinAgenda>(`${space.api}/agenda?days=7`);
  const navigate = useNavigate();
  const [open, setOpen] = useState<Open>(null);

  if (!s) return <div className="page"><Loading height={420} /></div>;
  const p = s.pipeline;
  const lost = s.by_stage.find((g) => g.key === "LOST");
  const base = space.base;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="t-caption">{longDate(s.as_of)}</div>
          <h1 className="t-title">{TITLES[s.space]}</h1>
        </div>
        <Link to={`${base}/affaires`} className="btn">
          Voir les {p.deals_count} affaires
        </Link>
      </div>

      <section className="hero" aria-label="Montants par étape">
        <div className="hero-top">
          <div>
            <div className="t-display num hero-figure" title={fcfa(p.open_amount)}>
              {compact(p.open_amount).replace(/\s?(M|Md)$/, "")}
              <span className="unit">{/Md$/.test(compact(p.open_amount)) ? "Md FCFA" : "M FCFA"}</span>
            </div>
            <div className="hero-caption">
              recherchés pour nos clients sur {p.open_count} affaires en cours, pour {compact(p.revenue)} de revenus attendus (honoraires et commissions de
              succès)
            </div>
          </div>
          <div className="hero-side">
            <div>
              <strong className="num">{p.mandates_count}</strong>
              mandats signés ou plus
            </div>
            <div>
              <strong className="num">{p.won_count}</strong>
              financements obtenus
            </div>
            {p.overdue_count > 0 && (
              <div>
                <strong className="num">{p.overdue_count}</strong>
                closings dépassés
              </div>
            )}
          </div>
        </div>
        <PipelineRibbon
          stages={s.by_stage}
          flowStages={FIN_FLOW_STAGES}
          label="Montants recherchés à chaque étape, de la prospection à l’encaissement"
          onSelect={(code) => navigate(`${base}/affaires?stage=${code}`)}
        />
        <div className="ribbon-foot">
          <span>L’épaisseur du ruban suit le montant recherché à chaque étape.</span>
          {lost && lost.count > 0 && (
            <span>
              Hors flux : {lost.count} perdue{lost.count > 1 ? "s" : ""} ({compact(lost.amount)})
            </span>
          )}
        </div>
      </section>

      <section className="figures" aria-label="Indicateurs clés">
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--accent-fill)" }} />
            Revenu pondéré
          </div>
          <div className="figure-value num" title={fcfa(p.weighted_revenue)}>
            {compact(p.weighted_revenue)}
          </div>
          <div className="figure-note">(Honoraire + commission) × probabilité de closing</div>
        </div>
        <div className="figure">
          <div className="figure-label">Honoraires</div>
          <div className="figure-value num" title={fcfa(p.fee)}>
            {compact(p.fee)}
          </div>
          <div className="figure-note">Forfaits d’étude et de structuration fixés</div>
        </div>
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--green)" }} />
            Encaissé
          </div>
          <div className="figure-value num" title={fcfa(s.cash.received)}>
            {compact(s.cash.received)}
          </div>
          <div className="figure-note">Honoraires et commissions reçus</div>
        </div>
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--amber)" }} />
            À recouvrer
          </div>
          <div className="figure-value num" title={fcfa(s.cash.outstanding)}>
            {compact(s.cash.outstanding)}
          </div>
          <div className="figure-note">
            <Link to={`${base}/encaissements`}>
              dont {compact(s.cash.commission_outstanding)} de commissions sur financements obtenus
            </Link>
          </div>
        </div>
      </section>

      <div className="split section">
        <section aria-labelledby="todo">
          <div className="section-head">
            <h2 className="t-headline" id="todo">
              À traiter cette semaine
            </h2>
            <Link to={`${base}/actions`} className="t-caption">
              Tout le plan d’actions
            </Link>
          </div>
          {!agenda ? (
            <Loading />
          ) : agenda.actions.length + agenda.deals.length === 0 ? (
            <div className="group">
              <Empty title="Rien d’urgent cette semaine">Les relances et les closings prévus dans les 7 prochains jours apparaîtront ici.</Empty>
            </div>
          ) : (
            <>
              {agenda.actions.length > 0 && (
                <>
                  <div className="group-label">
                    <span>Actions</span>
                    <span className="num">{agenda.actions.length}</span>
                  </div>
                  <div className="group">
                    {agenda.actions.slice(0, ACTIONS_SHOWN).map((a) => (
                      <ActionRow key={`${a.id}-${a.done}`} action={a} onOpen={() => setOpen({ kind: "action", item: a })} />
                    ))}
                    {agenda.actions.length > ACTIONS_SHOWN && (
                      <Link to={`${base}/actions`} className="row flush" style={{ minHeight: 44, color: "var(--accent)" }}>
                        Voir les {agenda.actions.length - ACTIONS_SHOWN} autres actions de la semaine
                      </Link>
                    )}
                  </div>
                </>
              )}
              {agenda.deals.length > 0 && (
                <>
                  <div className="group-label" style={{ marginTop: agenda.actions.length ? 20 : 0 }}>
                    <span>Closings prévus ou dépassés</span>
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
                            {d.stage_label} · <Due date={d.due_date} days={d.days_to_due} />
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

        <section aria-labelledby="sectors">
          <div className="section-head">
            <h2 className="t-headline" id="sectors">
              Par domaine
            </h2>
            <span className="t-caption">Affaires en cours</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Domaine</th>
                  <th className="right">Affaires</th>
                  <th className="right">Montant</th>
                  <th className="right hide-sm">Revenu pondéré</th>
                </tr>
              </thead>
              <tbody>
                {s.by_sector.map((g) => (
                  <tr key={g.key} onClick={() => g.key !== "Non renseigné" && navigate(`${base}/affaires?domaine=${encodeURIComponent(g.key)}`)}>
                    <td>{g.key}</td>
                    <td className="right num">{g.count}</td>
                    <td className="right">
                      <Amount value={g.amount} />
                    </td>
                    <td className="right hide-sm">
                      <Amount value={g.weighted_revenue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {open?.kind === "deal" && <FinDealSheet deal={open.item} onClose={() => setOpen(null)} />}
      {open?.kind === "action" && <FinActionSheet action={open.item} onClose={() => setOpen(null)} />}
    </div>
  );
}
