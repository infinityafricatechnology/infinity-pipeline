import { useDeferredValue, useEffect, useState } from "react";
import { IconPlus } from "../../components/icons";
import { IapContactSheet } from "../../components/iap-sheets";
import { PAGE_SIZE, Pagination } from "../../components/Pagination";
import { Empty, FilterSelect, Loading, Search } from "../../components/ui";
import { type Page, qs, useApi } from "../../lib/api";
import { useDeepLink } from "../../lib/deeplink";
import { IAP_CONTACT_ROLES, type IapContact } from "../../lib/types";

/** Carnet d'adresses d'IAP : acquéreurs, locataires, propriétaires, agences partenaires, apporteurs. */
export function IapContacts() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<IapContact | "new" | null>(null);
  const clearLink = useDeepLink<IapContact>("contact", (id) => `/iap/contacts/${id}`, setOpen);
  const query = useDeferredValue(q);
  useEffect(() => setPage(1), [query, role]);
  const { data, isLoading } = useApi<Page<IapContact>>(`/iap/contacts${qs({ q: query, role, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })}`, {
    keepPrevious: true,
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="t-title">Contacts</h1>
          <p className="lede">Acquéreurs, locataires, propriétaires, agences partenaires et apporteurs d’affaires d’IAP.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen("new")}>
          <IconPlus />
          Nouveau contact
        </button>
      </div>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Nom, société, téléphone, e-mail…" />
        <FilterSelect label="Rôle" value={role} onChange={setRole} options={IAP_CONTACT_ROLES} />
        <span className="spacer" />
        {data && <span className="t-caption num">{data.total} contacts</span>}
      </div>
      {isLoading ? (
        <Loading height={320} />
      ) : !data?.results.length ? (
        <div className="group">
          <Empty title={q || role ? "Aucun contact ne correspond" : "Aucun contact pour l’instant"}>
            {q || role ? "Modifiez la recherche ou retirez un filtre." : "Ajoutez vos acquéreurs, propriétaires et agences partenaires avec « Nouveau contact »."}
          </Empty>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Rôle</th>
                  <th className="hide-sm">Téléphone</th>
                  <th className="hide-sm">E-mail</th>
                  <th className="hide-sm">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((c) => (
                  <tr key={c.id} onClick={() => setOpen(c)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(c)}>
                    <td className="cell-title">
                      {c.name}
                      {c.company && <span className="cell-sub">{c.company}</span>}
                    </td>
                    <td>{c.role ?? <span className="muted">—</span>}</td>
                    <td className="hide-sm num">{c.phone ?? <span className="muted">—</span>}</td>
                    <td className="hide-sm">{c.email ? <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a> : <span className="muted">—</span>}</td>
                    <td className="hide-sm">
                      <span className="clamp-2 muted">{c.notes ?? "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={data.total} onChange={setPage} noun="contacts" />
        </>
      )}
      {open && (
        <IapContactSheet
          contact={open === "new" ? null : open}
          onClose={() => {
            setOpen(null);
            clearLink();
          }}
        />
      )}
    </div>
  );
}
