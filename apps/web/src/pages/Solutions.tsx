import { useState } from "react";
import { useSearchParams } from "react-router";
import { IconPlus } from "../components/icons";
import { Pagination, usePaged } from "../components/Pagination";
import { ProspectSheet, SolutionSheet } from "../components/sheets";
import { Dots, Empty, Loading, Prio, Stage, Status, type Tone } from "../components/ui";
import { type Page, useApi } from "../lib/api";
import { date } from "../lib/format";
import type { Pitch, Prospect, Solution } from "../lib/types";

const masteryTone = (m: string | null): Tone => (m === "Maîtrisé" ? "good" : m === "En cours" ? "info" : m ? "warn" : "none");

export function Solutions() {
  const { data: solutions } = useApi<Page<Solution>>("/solutions?limit=100");
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get("solution")) || solutions?.results[0]?.id;
  const selected = solutions?.results.find((s) => s.id === selectedId);
  const { data: prospects } = useApi<Page<Prospect>>(selected ? `/prospects?solution_id=${selected.id}&limit=500` : null);
  const { data: pitches } = useApi<Page<Pitch>>(selected ? `/pitches?solution_id=${selected.id}` : null);
  const [openProspect, setOpenProspect] = useState<Prospect | "new" | null>(null);
  const [editSolution, setEditSolution] = useState<Solution | "new" | null>(null);
  const pagedProspects = usePaged(prospects?.results ?? [], String(selectedId));

  if (!solutions) return <div className="page"><Loading height={420} /></div>;
  if (solutions.results.length === 0 && !editSolution) {
    return (
      <div className="page">
        <div className="group">
          <Empty title="Le catalogue est vide">
            <p style={{ margin: "4px 0 12px" }}>Ajoutez la première solution que vous vendez, puis ses prospects.</p>
            <button type="button" className="btn btn-primary" onClick={() => setEditSolution("new")}>
              Nouvelle solution
            </button>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="t-title">Solutions et prospects</h1>
          <p className="lede">Ce qu’on vend, à qui, avec quel argument. On ne vend pas ce qu’on ne maîtrise pas : tenez la maîtrise commerciale à jour.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {selected && (
            <button type="button" className="btn" onClick={() => setOpenProspect("new")}>
              <IconPlus />
              Nouveau prospect
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setEditSolution("new")}>
            <IconPlus />
            Nouvelle solution
          </button>
        </div>
      </div>
      <div className="master-detail">
        <nav className="group master" aria-label="Solutions">
          {solutions.results.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`row flush${s.id === selectedId ? " selected" : ""}`}
              onClick={() => setParams({ solution: String(s.id) }, { replace: true })}
              aria-current={s.id === selectedId}
            >
              <span className="row-main">
                <span className="row-title">{s.name}</span>
                <span className="row-meta">{s.category}</span>
              </span>
              <span className="row-aside num">{s.prospects_count || ""}</span>
            </button>
          ))}
        </nav>

        {selected && (
          <div style={{ minWidth: 0 }}>
            <section className="panel detail-head">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="t-caption">{selected.vendor}</div>
                  <h2 className="t-title" style={{ fontSize: 24 }}>
                    {selected.name}
                  </h2>
                </div>
                <button type="button" className="btn" onClick={() => setEditSolution(selected)}>
                  Modifier
                </button>
              </div>
              {selected.value_pitch && <p className="t-body-l" style={{ margin: "12px 0 0", maxWidth: "64ch", color: "var(--ink-2)" }}>{selected.value_pitch}</p>}
              <dl className="facts">
                <div>
                  <dt>Maîtrise commerciale</dt>
                  <dd>
                    <Status tone={masteryTone(selected.mastery)}>{selected.mastery ?? "À renseigner"}</Status>
                  </dd>
                </div>
                <div>
                  <dt>Partenariat</dt>
                  <dd>{selected.partnership_status ?? "—"}</dd>
                </div>
                <div>
                  <dt>Référent interne</dt>
                  <dd>{selected.internal_expert ?? "—"}</dd>
                </div>
                <div>
                  <dt>Priorité</dt>
                  <dd>
                    <Prio value={selected.priority} />
                  </dd>
                </div>
                {selected.target_sectors && (
                  <div>
                    <dt>Cibles sectorielles</dt>
                    <dd>{selected.target_sectors}</dd>
                  </div>
                )}
                {selected.existing_clients && (
                  <div>
                    <dt>Clients existants</dt>
                    <dd>{selected.existing_clients}</dd>
                  </div>
                )}
                {selected.next_action && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <dt>Prochaine action</dt>
                    <dd>{selected.next_action}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="section">
              <div className="section-head">
                <h2 className="t-headline">Prospects</h2>
                <button type="button" className="btn btn-plain" onClick={() => setOpenProspect("new")}>
                  <IconPlus />
                  Ajouter
                </button>
              </div>
              {!prospects ? (
                <Loading />
              ) : prospects.results.length === 0 ? (
                <div className="group">
                  <Empty title="Aucun prospect pour cette solution">Objectif : au moins un prospect attaqué par semaine.</Empty>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Prospect</th>
                        <th>Étape</th>
                        <th>Semaine d’attaque</th>
                        <th className="hide-sm">Relation IAG</th>
                        <th className="hide-sm">Contact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedProspects.items.map((p) => (
                        <tr key={p.id} onClick={() => setOpenProspect(p)}>
                          <td className="cell-title">
                            {p.company}
                            <span className="cell-sub">{p.sector}</span>
                          </td>
                          <td>{p.stage ? <Stage code={p.stage} /> : <span className="muted">—</span>}</td>
                          <td>{p.attack_week ? date(p.attack_week, true) : <span className="muted">—</span>}</td>
                          <td className="hide-sm">
                            <Dots value={p.relationship_score} />
                          </td>
                          <td className="hide-sm">
                            <span className="clamp-2 muted" style={{ maxWidth: "30ch" }}>
                              {p.contact ?? "À identifier"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={pagedProspects.page} total={pagedProspects.total} onChange={pagedProspects.setPage} noun="prospects" />
            </section>

            {pitches && pitches.results.length > 0 && (
              <section className="section">
                <div className="section-head">
                  <h2 className="t-headline">Pitchs par segment</h2>
                </div>
                <div className="panel">
                  {pitches.results.map((p) => (
                    <article key={p.id} className="pitch">
                      <div className="t-caption" style={{ fontWeight: 600 }}>
                        {p.segment}
                      </div>
                      {p.promise && <blockquote>{p.promise.replace(/^«\s*|\s*»$/g, "")}</blockquote>}
                      {p.stake && (
                        <p>
                          <b>Enjeu.</b> {p.stake}
                        </p>
                      )}
                      {p.offer && (
                        <p>
                          <b>Ce que nous apportons.</b> {p.offer}
                        </p>
                      )}
                      {p.hook && (
                        <p>
                          <b>Accroche.</b> {p.hook}
                        </p>
                      )}
                      {p.call_to_action && (
                        <p>
                          <b>Appel à l’action.</b> {p.call_to_action}
                        </p>
                      )}
                      {p.targets && (
                        <p>
                          <b>Cibles prioritaires.</b> {p.targets}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      {openProspect && (
        <ProspectSheet
          prospect={openProspect === "new" ? null : openProspect}
          defaults={selected ? { solution_id: selected.id } : undefined}
          onClose={() => setOpenProspect(null)}
        />
      )}
      {editSolution && (
        <SolutionSheet
          solution={editSolution === "new" ? null : editSolution}
          onClose={() => setEditSolution(null)}
          // Une solution créée est aussitôt sélectionnée, prête à recevoir ses prospects.
          onSaved={(saved) => setParams({ solution: String(saved.id) }, { replace: true })}
        />
      )}
    </div>
  );
}
