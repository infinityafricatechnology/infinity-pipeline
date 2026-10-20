import { type ReactNode, useState } from "react";
import { Link, useParams } from "react-router";
import { IconBack, IconPlus } from "../components/icons";
import { Pagination, usePaged } from "../components/Pagination";
import { AccountSheet, ContactSheet, DealSheet, InvoiceSheet, KINDS, OpportunitySheet, RenewalSheet } from "../components/sheets";
import { Amount, Due, Dots, Empty, Health, Loading, Prio, Row, Stage, Status, renewalTone } from "../components/ui";
import { useApi } from "../lib/api";
import { compact, date, fcfa } from "../lib/format";
import type { Account, Contact, Deal, Invoice, Opportunity, Renewal } from "../lib/types";

type Overview = {
  account: Account;
  deals: Deal[];
  invoices: Invoice[];
  invoice_totals: { amount: number; commission: number; net_revenue: number; margin: number; collected: number; balance: number };
  open_offers_amount: number;
  renewals: Renewal[];
  opportunities: Opportunity[];
  contacts: Contact[];
};

type Open =
  | { kind: "account" }
  | { kind: "deal"; item: Deal | null }
  | { kind: "invoice"; item: Invoice | null }
  | { kind: "renewal"; item: Renewal | null }
  | { kind: "opportunity"; item: Opportunity | null }
  | { kind: "contact"; item: Contact | null }
  | null;

function Section({ title, aside, action, children }: { title: string; aside?: ReactNode; action?: () => void; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="t-headline">{title}</h2>
        <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
          {aside && <span className="t-caption">{aside}</span>}
          {action && (
            <button type="button" className="btn btn-plain" onClick={action}>
              <IconPlus />
              Ajouter
            </button>
          )}
        </span>
      </div>
      {children}
    </section>
  );
}

export function AccountDetail() {
  const { slug } = useParams();
  const { data, error } = useApi<Overview>(`/accounts/${slug}/overview`);
  const [open, setOpen] = useState<Open>(null);
  const pagedDeals = usePaged(data?.deals ?? [], slug);
  const pagedInvoices = usePaged(data?.invoices ?? [], slug);
  const pagedOpportunities = usePaged(data?.opportunities ?? [], slug);
  const pagedContacts = usePaged(data?.contacts ?? [], slug);
  if (error) return <div className="page"><Empty title="Compte introuvable">{error.message}</Empty></div>;
  if (!data) return <div className="page"><Loading height={420} /></div>;
  const { account: a, invoice_totals: t } = data;
  const years = [...new Set(data.invoices.map((i) => i.fiscal_year).filter(Boolean) as number[])].sort();
  const byYear = years.map((y) => data.invoices.filter((i) => i.fiscal_year === y).reduce((s, i) => s + (i.amount ?? 0), 0));
  const maxYear = Math.max(...byYear, 1);
  const close = () => setOpen(null);
  const accountRef = { account_id: a.id };

  const facts: [string, ReactNode][] = [
    ["Secteur", a.sector],
    ["Responsable IAT", a.iat_lead],
    ["Relation haut niveau", a.executive_sponsor],
    ["Direction générale", a.leadership_summary],
    ["Interlocuteur direction", a.contact_direction],
    ["Interlocuteur opérationnel", a.contact_operational],
    ["Achats / marchés", a.contact_purchasing],
    ["Facturation", a.billing_details],
    ["Prochain point prévu", a.next_meeting],
    ["Dernier contact", a.last_contact ? date(a.last_contact, true) : null],
  ];

  return (
    <div className="page">
      <Link to="/comptes" className="btn btn-plain" style={{ marginLeft: -8, marginBottom: 8 }}>
        <IconBack />
        Comptes
      </Link>
      <div className="page-head account-head">
        <div>
          <div className="t-caption">{KINDS.find((k) => k.value === a.kind)?.label}</div>
          <h1 className="t-title">{a.display_name ?? a.name}</h1>
          <div style={{ display: "flex", gap: 18, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Health value={a.health} />
            {a.satisfaction != null && (
              <span className="t-caption" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                Satisfaction <Dots value={a.satisfaction} />
              </span>
            )}
          </div>
        </div>
        <button type="button" className="btn" onClick={() => setOpen({ kind: "account" })}>
          Modifier la fiche
        </button>
      </div>

      <section className="figures" aria-label="Chiffres du compte">
        <div className="figure">
          <div className="figure-label">Facturé depuis {years[0] ?? "—"}</div>
          <div className="figure-value num" title={fcfa(t.amount)}>
            {compact(t.amount)}
          </div>
          {years.length > 0 && (
            <div className="yearbars" style={{ marginTop: 10, height: 30 }} title={years.map((y, i) => `${y} : ${fcfa(byYear[i])}`).join("\n")}>
              {byYear.map((v, i) => (
                <i key={years[i]} className={v === 0 ? "zero" : i === years.length - 1 ? "cur" : ""} style={{ height: `${Math.max(8, (v / maxYear) * 100)}%`, width: 10 }} />
              ))}
            </div>
          )}
        </div>
        <div className="figure">
          <div className="figure-label">Reste à encaisser</div>
          <div className="figure-value num">{compact(t.balance)}</div>
          <div className="figure-note">{compact(t.collected)} encaissés</div>
        </div>
        <div className="figure">
          <div className="figure-label">Offres en cours</div>
          <div className="figure-value num">{compact(data.open_offers_amount)}</div>
          <div className="figure-note">
            {(() => {
              const n = data.deals.filter((d) => d.is_open).length;
              return n === 0 ? "Aucune affaire ouverte" : `${n} affaire${n > 1 ? "s" : ""} ouverte${n > 1 ? "s" : ""}`;
            })()}
          </div>
        </div>
        <div className="figure">
          <div className="figure-label">Commission</div>
          <div className="figure-value num">{compact(t.commission)}</div>
          <div className="figure-note">Marge {compact(t.margin)}</div>
        </div>
      </section>

      {(a.notes || facts.some(([, v]) => v)) && (
        <Section title="Fiche">
          <div className="panel">
            <dl className="kv" style={{ margin: 0 }}>
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {a.notes && <p className="notes">{a.notes}</p>}
          </div>
        </Section>
      )}

      <Section title="Affaires" aside={`${data.deals.length} au total`} action={() => setOpen({ kind: "deal", item: null })}>
        {data.deals.length === 0 ? (
          <div className="group">
            <Empty title="Aucune affaire sur ce compte">Ajoutez la première pour la suivre dans le pipeline.</Empty>
          </div>
        ) : (
          <div className="group">
            {pagedDeals.items.map((d) => (
              <Row
                key={d.id}
                className="flush"
                title={d.title}
                meta={
                  <span style={{ display: "inline-flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <Stage code={d.stage} />
                    {d.due_date && <Due date={d.due_date} days={d.days_to_due} done={!d.is_open} />}
                  </span>
                }
                aside={
                  <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                    <Prio value={d.priority} />
                    <Amount value={d.amount} />
                  </span>
                }
                onClick={() => setOpen({ kind: "deal", item: d })}
              />
            ))}
          </div>
        )}
        <Pagination page={pagedDeals.page} total={pagedDeals.total} onChange={pagedDeals.setPage} noun="affaires" />
      </Section>

      <Section title="Facturation et encaissements" aside="Point comptable" action={() => setOpen({ kind: "invoice", item: null })}>
        {data.invoices.length === 0 ? (
          <div className="group">
            <Empty title="Rien de facturé pour l’instant" />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Produit / service</th>
                  <th>Exercice</th>
                  <th className="right">Facturé</th>
                  <th className="right hide-sm">Commission</th>
                  <th className="right hide-sm">Encaissé</th>
                  <th className="right">Solde</th>
                </tr>
              </thead>
              <tbody>
                {pagedInvoices.items.map((i) => (
                  <tr key={i.id} onClick={() => setOpen({ kind: "invoice", item: i })}>
                    <td className="cell-title">
                      {i.product}
                      <span className="cell-sub">
                        {[i.invoice_number && `N° ${i.invoice_number}`, i.invoice_date ? `Facturé le ${date(i.invoice_date, true)}` : "Date de facturation à renseigner"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td className="num">{i.fiscal_year ?? "—"}</td>
                    <td className="right">
                      <Amount value={i.amount} />
                    </td>
                    <td className="right hide-sm">{i.commission ? <Amount value={i.commission} /> : <span className="muted">—</span>}</td>
                    <td className="right hide-sm">
                      <Amount value={i.collected} />
                    </td>
                    <td className="right">{i.balance ? <Status tone="warn">{compact(i.balance)}</Status> : <span className="muted">Soldé</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td className="right num">{compact(t.amount)}</td>
                  <td className="right num hide-sm">{compact(t.commission)}</td>
                  <td className="right num hide-sm">{compact(t.collected)}</td>
                  <td className="right num">{compact(t.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <Pagination page={pagedInvoices.page} total={pagedInvoices.total} onChange={pagedInvoices.setPage} noun="factures" />
      </Section>

      {data.renewals.length > 0 && (
        <Section title="Renouvellements">
          <div className="group">
            {data.renewals.map((r) => (
              <Row
                key={r.id}
                className="flush"
                title={r.contract}
                meta={r.due_date ? `Échéance le ${date(r.due_date, true)}, relance J-90 le ${date(r.reminder_90, true)} · ${r.status}` : r.status}
                aside={<Status tone={renewalTone(r.alert)}>{r.alert}</Status>}
                onClick={() => setOpen({ kind: "renewal", item: r })}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title="Stratégie de continuité et de développement" action={() => setOpen({ kind: "opportunity", item: null })}>
        {data.opportunities.length === 0 ? (
          <div className="group">
            <Empty title="Aucune opportunité notée">Vente croisée, extension, renouvellement : notez les pistes du compte.</Empty>
          </div>
        ) : (
          <div className="group">
            {pagedOpportunities.items.map((o) => (
              <Row
                key={o.id}
                className="flush"
                title={o.title}
                meta={o.action ?? o.solution}
                aside={<Prio value={o.priority} />}
                onClick={() => setOpen({ kind: "opportunity", item: o })}
              />
            ))}
          </div>
        )}
        <Pagination page={pagedOpportunities.page} total={pagedOpportunities.total} onChange={pagedOpportunities.setPage} noun="pistes" />
      </Section>

      <Section title="Contacts et dirigeants" aside={`${data.contacts.length}`} action={() => setOpen({ kind: "contact", item: null })}>
        {data.contacts.length === 0 ? (
          <div className="group">
            <Empty title="Aucun contact rattaché">Ajoutez le DSI ou l’interlocuteur opérationnel du compte.</Empty>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th className="hide-sm">Profil</th>
                  <th>Téléphone</th>
                  <th className="hide-sm">E-mail</th>
                </tr>
              </thead>
              <tbody>
                {pagedContacts.items.map((c) => (
                  <tr key={c.id} onClick={() => setOpen({ kind: "contact", item: c })}>
                    <td className="cell-title">
                      {c.name}
                      <span className="cell-sub">
                        {c.role ?? "Fonction non renseignée"}
                        {c.source === "research" ? " · dirigeant identifié" : ""}
                      </span>
                    </td>
                    <td className="hide-sm muted">{c.profile ?? "—"}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pagedContacts.page} total={pagedContacts.total} onChange={pagedContacts.setPage} noun="contacts" />
      </Section>

      {open?.kind === "account" && <AccountSheet account={a} onClose={close} />}
      {open?.kind === "deal" && <DealSheet deal={open.item} defaults={accountRef} onClose={close} />}
      {open?.kind === "invoice" && <InvoiceSheet invoice={open.item} defaults={accountRef} onClose={close} />}
      {open?.kind === "renewal" && <RenewalSheet renewal={open.item} defaults={accountRef} onClose={close} />}
      {open?.kind === "opportunity" && <OpportunitySheet opportunity={open.item} defaults={accountRef} onClose={close} />}
      {open?.kind === "contact" && <ContactSheet contact={open.item} defaults={{ ...accountRef, company: a.name }} onClose={close} />}
    </div>
  );
}
