import { useState } from "react";
import { useNavigate } from "react-router";
import { IconPlus } from "../components/icons";
import { Pagination, usePaged } from "../components/Pagination";
import { AccountSheet, KINDS } from "../components/sheets";
import { Amount, Empty, FilterSelect, Health, Loading, Search } from "../components/ui";
import { type Page, qs, useApi } from "../lib/api";
import { compact } from "../lib/format";
import type { Account, Summary } from "../lib/types";

export function Accounts() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { data } = useApi<Page<Account>>(`/accounts${qs({ q, kind, limit: 500 })}`, { keepPrevious: true });
  const { data: summary } = useApi<Summary>("/summary");
  const followed = (data?.results ?? []).filter((a) => a.has_fiche);
  const others = (data?.results ?? []).filter((a) => !a.has_fiche);
  const pagedFollowed = usePaged(followed, `${q}|${kind}`);
  const pagedOthers = usePaged(others, `${q}|${kind}`);
  if (!data) return <div className="page"><Loading height={400} /></div>;
  const stats = new Map(summary?.accounts.map((a) => [a.id, a]));
  const lastYear = summary?.billing.years.at(-1);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="t-title">Comptes</h1>
          <p className="lede">
            {followed.length} clients et partenaires suivis avec une fiche complète, {others.length} prospects et autres comptes du pipeline.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <IconPlus />
          Nouveau compte
        </button>
      </div>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Rechercher un compte" />
        <FilterSelect label="Type de compte" value={kind} onChange={setKind} options={KINDS} />
      </div>

      {followed.length > 0 && (
        <>
          <div className="group-label">Clients et partenaires suivis</div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Compte</th>
                  <th>État de santé</th>
                  <th className="right">Facturé {lastYear}</th>
                  <th className="right hide-sm">Reste à encaisser</th>
                  <th className="right">Offres en cours</th>
                  <th className="hide-sm">Responsable IAT</th>
                </tr>
              </thead>
              <tbody>
                {pagedFollowed.items.map((a) => {
                  const st = stats.get(a.id);
                  return (
                    <tr key={a.id} onClick={() => navigate(`/comptes/${a.slug}`)}>
                      <td className="cell-title">
                        {a.name}
                        <span className="cell-sub">{a.sector ?? KINDS.find((k) => k.value === a.kind)?.label}</span>
                      </td>
                      <td>
                        <Health value={a.health} />
                      </td>
                      <td className="right">
                        <Amount value={st && lastYear ? st.invoiced_by_year[lastYear] : null} />
                      </td>
                      <td className="right hide-sm">{st?.outstanding ? <Amount value={st.outstanding} /> : <span className="muted">—</span>}</td>
                      <td className="right">{a.open_amount ? <Amount value={a.open_amount} /> : <span className="muted">—</span>}</td>
                      <td className="hide-sm">{a.iat_lead ?? <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={pagedFollowed.page} total={pagedFollowed.total} onChange={pagedFollowed.setPage} noun="comptes" />
          <div style={{ height: 32 }} />
        </>
      )}

      <div className="group-label">
        <span>Prospects et autres comptes</span>
        <span className="num">{compact(others.reduce((t, a) => t + a.open_amount, 0))} en cours</span>
      </div>
      {others.length === 0 ? (
        <div className="group">
          <Empty title="Aucun compte ne correspond" />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Compte</th>
                <th>Type</th>
                <th className="right">Affaires</th>
                <th className="right">Montant en cours</th>
              </tr>
            </thead>
            <tbody>
              {pagedOthers.items.map((a) => (
                <tr key={a.id} onClick={() => navigate(`/comptes/${a.slug}`)}>
                  <td className="cell-title">{a.name}</td>
                  <td className="muted">{KINDS.find((k) => k.value === a.kind)?.label}</td>
                  <td className="right num">{a.deals_count}</td>
                  <td className="right">{a.open_amount ? <Amount value={a.open_amount} /> : <span className="muted">Non chiffré</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={pagedOthers.page} total={pagedOthers.total} onChange={pagedOthers.setPage} noun="comptes" />
      {creating && <AccountSheet account={null} onClose={() => setCreating(false)} />}
    </div>
  );
}
