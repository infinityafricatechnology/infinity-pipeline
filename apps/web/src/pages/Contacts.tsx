import { useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router";
import { IconPlus } from "../components/icons";
import { PAGE_SIZE, Pagination } from "../components/Pagination";
import { CONTACT_PROFILES, CONTACT_STATUSES, ContactSheet } from "../components/sheets";
import { Empty, FilterSelect, Loading, Search, Status } from "../components/ui";
import { type Page, qs, useApi } from "../lib/api";
import { useDeepLink } from "../lib/deeplink";
import type { Contact } from "../lib/types";


export function Contacts() {
  const [q, setQ] = useState("");
  const [profile, setProfile] = useState("");
  const [status, setStatus] = useState("");
  const [linked, setLinked] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Contact | "new" | null>(null);
  const clearLink = useDeepLink<Contact>("contact", (id) => `/contacts/${id}`, setOpen);
  const query = useDeferredValue(q);
  // Pagination côté serveur : seule la page affichée est chargée.
  useEffect(() => setPage(1), [query, profile, status, linked]);
  const { data, isLoading } = useApi<Page<Contact>>(
    `/contacts${qs({ q: query, profile, status, linked, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })}`,
    { keepPrevious: true },
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="t-title">Contacts</h1>
          <p className="lede">Base clients Côte d’Ivoire et dirigeants identifiés. Les contacts rattachés au pipeline apparaissent en premier.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen("new")}>
          <IconPlus />
          Nouveau contact
        </button>
      </div>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Nom, entreprise, fonction, e-mail…" />
        <FilterSelect label="Profil" value={profile} onChange={setProfile} options={CONTACT_PROFILES} />
        <FilterSelect label="Statut" value={status} onChange={setStatus} options={CONTACT_STATUSES} />
        <FilterSelect
          label="Lien avec le pipeline"
          value={linked}
          onChange={setLinked}
          options={[
            { value: "true", label: "Rattachés au pipeline" },
            { value: "false", label: "Non rattachés" },
          ]}
        />
        {(q || profile || status || linked) && (
          <button
            type="button"
            className="btn btn-plain"
            onClick={() => {
              setQ("");
              setProfile("");
              setStatus("");
              setLinked("");
            }}
          >
            Effacer les filtres
          </button>
        )}
        <span className="spacer" />
        {data && <span className="t-caption num">{data.total} contacts</span>}
      </div>
      {isLoading ? (
        <Loading height={480} />
      ) : !data?.results.length ? (
        <div className="group">
          <Empty title="Aucun contact ne correspond">Modifiez la recherche ou retirez un filtre.</Empty>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Entreprise</th>
                  <th>Téléphone</th>
                  <th className="hide-sm">E-mail</th>
                  <th className="hide-sm">Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((c) => (
                  <tr key={c.id} onClick={() => setOpen(c)}>
                    <td className="cell-title">
                      {c.name}
                      <span className="cell-sub">{c.role ?? c.profile ?? "Fonction non renseignée"}</span>
                    </td>
                    <td>
                      {c.account_slug ? (
                        <Link to={`/comptes/${c.account_slug}`} onClick={(e) => e.stopPropagation()}>
                          {c.company ?? c.account_name}
                        </Link>
                      ) : (
                        (c.company ?? "—")
                      )}
                      {c.pipeline_link && <span className="cell-sub">{c.pipeline_link}</span>}
                    </td>
                    <td className="num">
                      {c.phone ? (
                        <a href={`tel:${c.phone.split("/")[0].replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()}>
                          {c.phone}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="hide-sm">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>
                          {c.email}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="hide-sm">
                      {c.status ? (
                        <Status tone={c.status === "Coordonnées à vérifier" ? "warn" : c.status === "RDV obtenu" ? "good" : c.status === "Contacté" ? "info" : "none"}>
                          {c.status}
                        </Status>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={data.total} onChange={setPage} noun="contacts" />
        </>
      )}
      {open && <ContactSheet contact={open === "new" ? null : open} onClose={() => {
            setOpen(null);
            clearLink();
          }} />}
    </div>
  );
}
