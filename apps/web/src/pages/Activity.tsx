import { useEffect, useState } from "react";
import { ViaTag } from "../components/EntitySheet";
import { PAGE_SIZE, Pagination } from "../components/Pagination";
import { Empty, Loading, Segmented } from "../components/ui";
import { useApi } from "../lib/api";
import { dateTime } from "../lib/format";
import type { Activity } from "../lib/types";

const ENTITIES: Record<string, string> = {
  deal: "Affaire",
  action: "Action",
  account: "Compte",
  invoice: "Facture",
  renewal: "Renouvellement",
  opportunity: "Opportunité",
  contact: "Contact",
  tender: "Appel d’offres",
  solution: "Solution",
  prospect: "Prospect",
  pitch: "Pitch",
};
const VERBS = { create: "a créé", update: "a modifié", delete: "a supprimé" };

export function ActivityPage() {
  const [via, setVia] = useState<"" | "claude" | "web">("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [via]);
  // Pagination côté serveur : le journal ne fait que grandir.
  const { data } = useApi<{ results: Activity[]; total: number }>(
    `/activity?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}${via ? `&via=${via}` : ""}`,
    { keepPrevious: true },
  );

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1 className="t-title">Journal</h1>
          <p className="lede">Chaque création, modification et suppression, avec son auteur et le canal utilisé. Les actions faites par Claude sont signalées.</p>
        </div>
      </div>
      <div className="toolbar">
        <Segmented
          label="Canal"
          value={via}
          onChange={setVia}
          options={[
            { value: "", label: "Tout" },
            { value: "claude", label: "Via Claude" },
            { value: "web", label: "Application" },
          ]}
        />
      </div>
      {!data ? (
        <Loading />
      ) : data.results.length === 0 ? (
        <div className="group">
          <Empty title="Aucune modification pour l’instant">Elles apparaîtront ici dès la première saisie.</Empty>
        </div>
      ) : (
        <div className="group">
          {data.results.map((e) => (
            <div key={e.id} className="row flush" style={{ cursor: "default" }}>
              <span className="row-main">
                <span className="row-title" style={{ whiteSpace: "normal" }}>
                  {e.user_name ?? "—"} {VERBS[e.action]} {ENTITIES[e.entity]?.toLowerCase() ?? e.entity} « {e.label} »
                </span>
                <span className="row-meta">
                  {dateTime(e.at)}
                  {e.action === "update" && e.changes ? ` · ${Object.keys(e.changes).join(", ").replace(/_/g, " ")}` : ""}
                </span>
              </span>
              <span className="row-aside">
                <ViaTag via={e.via} />
              </span>
            </div>
          ))}
        </div>
      )}
      {data && <Pagination page={page} total={data.total} onChange={setPage} noun="modifications" />}
    </div>
  );
}
