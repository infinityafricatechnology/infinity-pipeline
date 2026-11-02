import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { PipelineRibbon } from "../../charts/PipelineRibbon";
import { IapActionSheet, IapDealSheet } from "../../components/iap-sheets";
import { Amount, Due, Empty, Loading, Row, Status } from "../../components/ui";
import { useApi } from "../../lib/api";
import { compact, fcfa, longDate } from "../../lib/format";
import { type IapAction, type IapAgenda, type IapDeal, IAP_FLOW_STAGES, type IapSummary } from "../../lib/types";
import { ActionRow } from "../Actions";

const ACTIONS_SHOWN = 6;

type Open = { kind: "deal"; item: IapDeal } | { kind: "action"; item: IapAction } | null;

/** Vue d'ensemble d'IAP : portefeuille de biens, commissions, ce qui est à traiter, résultats par commercial. */
export function IapOverview() {
  const { data: s } = useApi<IapSummary>("/iap/summary");
  const { data: agenda } = useApi<IapAgenda>("/iap/agenda?days=7");
  const navigate = useNavigate();
  const [open, setOpen] = useState<Open>(null);

  if (!s) return <div className="page"><Loading height={420} /></div>;
  const p = s.pipeline;
  const lost = s.by_stage.find((g) => g.key === "LOST");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="t-caption">{longDate(s.as_of)}</div>
          <h1 className="t-title">Pipeline immobilier</h1>
        </div>
        <Link to="/iap/affaires" className="btn">
          Voir les {p.deals_count} affaires
        </Link>
      </div>

      <section className="hero" aria-label="Portefeuille par étape">
        <div className="hero-top">
          <div>
            <div className="t-display num hero-figure" title={fcfa(p.open_amount)}>
              {compact(p.open_amount).replace(/\s?(M|Md)$/, "")}
              <span className="unit">{/Md$/.test(compact(p.open_amount)) ? "Md FCFA" : "M FCFA"}</span>
            </div>
            <div className="hero-caption">
              de biens en portefeuille sur {p.open_count} affaires en cours, pour {compact(p.open_commission)} de commissions attendues
            </div>
          </div>
          <div className="hero-side">
            <div>
              <strong className="num">{p.mandates_signed_count}</strong>
              mandats signés
            </div>
            <div>
              <strong className="num">{p.to_sign_count}</strong>
              mandats à signer
            </div>
          </div>
        </div>
        <PipelineRibbon
          stages={s.by_stage}
          flowStages={IAP_FLOW_STAGES}
          label="Montants engagés à chaque étape, du mandat à signer à la vente conclue"
          onSelect={(code) => navigate(`/iap/affaires?stage=${code}`)}
        />
        <div className="ribbon-foot">
          <span>L’épaisseur du ruban suit le montant des biens à chaque étape.</span>
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
            Commission pondérée
          </div>
          <div className="figure-value num" title={fcfa(p.weighted_commission)}>
            {compact(p.weighted_commission)}
          </div>
          <div className="figure-note">Commission attendue × probabilité de closing</div>
        </div>
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--green)" }} />
            Conclu
          </div>
          <div className="figure-value num" title={fcfa(p.won_amount)}>
            {compact(p.won_amount)}
          </div>
          <div className="figure-note">
            {p.won_count} affaire{p.won_count > 1 ? "s" : ""} conclue{p.won_count > 1 ? "s" : ""}
          </div>
        </div>
        <div className="figure">
          <div className="figure-label">Commission perçue</div>
          <div className="figure-value num" title={fcfa(p.commission_received)}>
            {compact(p.commission_received)}
          </div>
          <div className="figure-note">Encaissée par IAP, base des parts commerciales</div>
        </div>
        <div className="figure">
          <div className="figure-label">Parts à verser</div>
          <div className="figure-value num" title={fcfa(s.commissions.due)}>
            {compact(s.commissions.due)}
          </div>
          <div className="figure-note">
            <Link to="/iap/commissions">{compact(s.commissions.expected)} estimés sur les affaires en cours</Link>
          </div>
        </div>
      </section>

      <div className="split section">
        <section aria-labelledby="todo">
          <div className="section-head">
            <h2 className="t-headline" id="todo">
              À traiter cette semaine
            </h2>
            <Link to="/iap/actions" className="t-caption">
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
                      <Link to="/iap/actions" className="row flush" style={{ minHeight: 44, color: "var(--accent)" }}>
                        Voir les {agenda.actions.length - ACTIONS_SHOWN} autres actions de la semaine
                      </Link>
                    )}
                  </div>
                </>
              )}
              {agenda.deals.length > 0 && (
                <>
                  <div className="group-label" style={{ marginTop: agenda.actions.length ? 20 : 0 }}>
                    <span>Closings prévus</span>
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
                            {[d.apporteur, d.stage_label].filter(Boolean).join(" · ")} · <Due date={d.due_date} days={d.days_to_due} />
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

        <section aria-labelledby="people">
          <div className="section-head">
            <h2 className="t-headline" id="people">
              Par commercial
            </h2>
            <span className="t-caption">Affaires en cours</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Apporteur</th>
                  <th className="right">Affaires</th>
                  <th className="right">Montant</th>
                  <th className="right">Commission</th>
                  <th className="right hide-sm">Pondérée</th>
                </tr>
              </thead>
              <tbody>
                {s.by_person.map((g) => (
                  <tr key={g.key} onClick={() => navigate(`/iap/affaires?personne=${encodeURIComponent(g.key)}`)}>
                    <td>{g.key}</td>
                    <td className="right num">{g.count}</td>
                    <td className="right">
                      <Amount value={g.amount} />
                    </td>
                    <td className="right">
                      <Amount value={g.commission} />
                    </td>
                    <td className="right hide-sm">
                      <Amount value={g.weighted_commission} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="policy-note">
            <strong>Fiche de commissionnement</strong>
            <span>
              Apporteur 5 %, closeur 10 %, 15 % si c’est la même personne, sur la commission effectivement perçue par IAP (depuis le 14 septembre 2026).
            </span>
            <Link to="/iap/commissions">Voir les commissions →</Link>
          </div>
        </section>
      </div>

      {open?.kind === "deal" && <IapDealSheet deal={open.item} onClose={() => setOpen(null)} />}
      {open?.kind === "action" && <IapActionSheet action={open.item} onClose={() => setOpen(null)} />}
    </div>
  );
}
