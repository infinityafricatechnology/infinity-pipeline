import { Link } from "react-router";
import { SpaceMark } from "../../components/Logo";
import { Amount, Empty, Loading } from "../../components/ui";
import { useApi } from "../../lib/api";
import { compact, fcfa, longDate } from "../../lib/format";
import { SPACES } from "../../lib/space";
import type { GroupSummary } from "../../lib/types";

/** Ce que « revenu attendu » recouvre dans chaque filiale. */
const REVENUE_NOTE = {
  iat: "Marge sur affaires",
  iap: "Commissions immobilières",
  iac: "Honoraires + commissions",
  iaf: "Honoraires + commissions",
} as const;

/**
 * Vue consolidée du groupe IAG : une ligne par filiale accessible, le total, et l'état des partenariats.
 * Les montants ne sont pas de même nature d'une filiale à l'autre (prix de biens, montants à lever,
 * affaires IT) : le total en donne l'ordre de grandeur, le détail reste dans chaque espace.
 */
export function GroupOverview() {
  const { data: s } = useApi<GroupSummary>("/groupe/summary");
  if (!s) return <div className="page"><Loading height={420} /></div>;
  const t = s.totals;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="t-caption">{longDate(s.as_of)}</div>
          <h1 className="t-title">Vue Groupe</h1>
          <p className="lede">Pipeline consolidé des filiales auxquelles vous avez accès.</p>
        </div>
        <Link to="/groupe/partenaires" className="btn">
          Voir les {s.partners.count} partenaires
        </Link>
      </div>

      <section className="figures" aria-label="Indicateurs du groupe">
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--accent-fill)" }} />
            Pipeline en cours
          </div>
          <div className="figure-value num" title={fcfa(t.open_amount)}>
            {compact(t.open_amount)}
          </div>
          <div className="figure-note">{t.open_count} affaires en cours dans {s.subsidiaries.length} filiales</div>
        </div>
        <div className="figure">
          <div className="figure-label">Pondéré</div>
          <div className="figure-value num" title={fcfa(t.weighted_amount)}>
            {compact(t.weighted_amount)}
          </div>
          <div className="figure-note">Montants × probabilité de closing</div>
        </div>
        <div className="figure">
          <div className="figure-label">Revenus attendus</div>
          <div className="figure-value num" title={fcfa(t.revenue)}>
            {compact(t.revenue)}
          </div>
          <div className="figure-note">Marges, commissions et honoraires</div>
        </div>
        <div className="figure">
          <div className="figure-label">
            <i style={{ background: "var(--green)" }} />
            Encaissé
          </div>
          <div className="figure-value num" title={fcfa(t.received)}>
            {compact(t.received)}
          </div>
          <div className="figure-note">Facturation IAT encaissée, commissions et honoraires reçus</div>
        </div>
      </section>

      <section className="section" aria-labelledby="subs">
        <div className="section-head">
          <h2 className="t-headline" id="subs">
            Par filiale
          </h2>
        </div>
        {s.subsidiaries.length === 0 ? (
          <div className="group">
            <Empty title="Aucune filiale accessible">Demandez l’accès à un espace à un administrateur.</Empty>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Filiale</th>
                  <th className="right">En cours</th>
                  <th className="right">Pipeline</th>
                  <th className="right hide-sm">Pondéré</th>
                  <th className="right">Revenu attendu</th>
                  <th className="right hide-sm">Encaissé</th>
                  <th className="right hide-sm">Actions en retard</th>
                </tr>
              </thead>
              <tbody>
                {s.subsidiaries.map((f) => (
                  <tr key={f.space}>
                    <td className="cell-title">
                      <Link to={SPACES[f.space].base} className="group-sub-link">
                        <SpaceMark space={f.space} className="group-sub-mark" />
                        <span>
                          <strong>{f.name}</strong>
                          <span className="cell-sub">{f.full_name}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="right num">
                      {f.open_count}
                      <span className="cell-sub">sur {f.deals_count}</span>
                    </td>
                    <td className="right">
                      <Amount value={f.open_amount} />
                    </td>
                    <td className="right hide-sm">
                      <Amount value={f.weighted_amount} />
                    </td>
                    <td className="right">
                      <Amount value={f.revenue} />
                      <span className="cell-sub">{REVENUE_NOTE[f.space]}</span>
                    </td>
                    <td className="right hide-sm">
                      <Amount value={f.received} />
                    </td>
                    <td className={`right num hide-sm${f.overdue_actions_count > 0 ? " warn-text" : ""}`}>{f.overdue_actions_count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Groupe</td>
                  <td className="right num">{t.open_count}</td>
                  <td className="right num" title={fcfa(t.open_amount)}>
                    {compact(t.open_amount)}
                  </td>
                  <td className="right num hide-sm">{compact(t.weighted_amount)}</td>
                  <td className="right num">{compact(t.revenue)}</td>
                  <td className="right num hide-sm">{compact(t.received)}</td>
                  <td className="right num hide-sm">{t.overdue_actions_count}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="partners">
        <div className="section-head">
          <h2 className="t-headline" id="partners">
            Partenaires stratégiques
          </h2>
          <Link to="/groupe/partenaires" className="t-caption">
            Toute la cartographie
          </Link>
        </div>
        <section className="figures" aria-label="Partenaires">
          <div className="figure">
            <div className="figure-label">Partenaires</div>
            <div className="figure-value num">{s.partners.count}</div>
            <div className="figure-note">
              {s.partners.by_entity
                .filter((e) => e.count > 0)
                .map((e) => `${e.key} ${e.count}`)
                .join(" · ")}
            </div>
          </div>
          <div className="figure">
            <div className="figure-label">Potentiel élevé</div>
            <div className="figure-value num">{s.partners.high_potential_count}</div>
            <div className="figure-note">
              <Link to="/groupe/partenaires?potentiel=Élevé">Voir ces partenaires</Link>
            </div>
          </div>
          <div className="figure">
            <div className="figure-label">Priorité P1</div>
            <div className="figure-value num">{s.partners.p1_count}</div>
            <div className="figure-note">
              <Link to="/groupe/partenaires?priorite=P1">Voir ces partenaires</Link>
            </div>
          </div>
          <div className="figure">
            <div className="figure-label">
              <i style={{ background: "var(--red)" }} />
              Échéances dépassées
            </div>
            <div className="figure-value num">{s.partners.overdue_count}</div>
            <div className="figure-note">
              <Link to="/groupe/partenaires?retard=1">Prochaines actions à relancer</Link>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
