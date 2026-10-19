"""Outils de lecture : synthèse, agenda, affaires, comptes, renouvellements, actions, contacts, catalogue."""

from typing import Annotated, Literal

from fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from .. import formatting
from ..deps import Deps
from ..resolve import Resolver

READ_ONLY = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)

StageCode = Literal["M0", "M1", "M2", "M3", "M4", "M5", "M6", "LOST", "CLOSED"]
AccountKind = Literal["client", "prospect", "tender", "partner"]
Priority = Literal["P1", "P2", "P3"]
IsoDate = Annotated[str, Field(description="Date au format AAAA-MM-JJ", pattern=r"^\d{4}-\d{2}-\d{2}$")]
AccountRef = Annotated[str, Field(description="Nom du compte (ex. CNPS, Orange Business), slug ou identifiant")]


def register_read_tools(mcp: FastMCP, deps: Deps) -> None:
    settings = deps.settings

    @mcp.tool(annotations=READ_ONLY)
    async def whoami() -> dict:
        """La personne connectée et la date du jour.

        À appeler d'abord quand la demande dépend de « moi » ou de dates relatives (« cette semaine », « en retard »).
        """
        async with deps.api() as api:
            me = await api.me()
        return {"user": me["user"], "today": me["today"], "app_url": settings.web_url}

    @mcp.tool(annotations=READ_ONLY)
    async def pipeline_overview() -> dict:
        """Synthèse du pipeline : montant total, pondéré, gagné, commissions, encaissements, contrats échus,
        répartition par étape et par responsable, et situation de chaque client suivi.

        Montants en FCFA. Pour un point général (« où en est-on ? »), commencez par cet outil.
        """
        async with deps.api() as api:
            summary = await api.get("/summary")
        return {
            "as_of": summary["as_of"],
            "pipeline": summary["pipeline"],
            "billing": summary["billing"],
            "contacts": summary["contacts"],
            "by_stage": [
                {k: g[k] for k in ("label", "count", "amount", "weighted_amount")}
                for g in summary["by_stage"]
                if g["count"]
            ],
            "by_lead": [
                {k: g[k] for k in ("key", "count", "amount", "weighted_amount", "p1_count")} for g in summary["by_lead"]
            ],
            "clients": [
                {
                    "name": a["name"],
                    "health": a["health"] or "À renseigner",
                    "invoiced_by_year": a["invoiced_by_year"],
                    "outstanding": a["outstanding"],
                    "open_offers": a["open_offers"],
                    "url": f"{settings.web_url}/comptes/{a['slug']}",
                }
                for a in summary["accounts"]
            ],
        }

    @mcp.tool(annotations=READ_ONLY)
    async def agenda(
        days: Annotated[int, Field(ge=0, le=365, description="Horizon en jours à partir d'aujourd'hui")] = 7,
    ) -> dict:
        """Ce qui est à traiter : actions non faites dont l'échéance tombe dans la période (retards compris),
        renouvellements échus ou à relancer, affaires en cours arrivant à échéance."""
        async with deps.api() as api:
            data = await api.get("/agenda", days=days)
        return {
            "as_of": data["as_of"],
            "until": data["horizon"],
            "renewals": [formatting.renewal(settings, r) for r in data["renewals"]],
            "actions": [formatting.action(settings, a) for a in data["actions"]],
            "deals": [formatting.deal(settings, d) for d in data["deals"]],
        }

    @mcp.tool(annotations=READ_ONLY)
    async def search_deals(
        text: Annotated[
            str | None, Field(description="Mots de l'intitulé, du compte, de la solution ou des commentaires")
        ] = None,
        account: Annotated[str | None, Field(description="Nom du compte")] = None,
        stage: Annotated[
            StageCode | None, Field(description="M0 à qualifier … M6 gagné, LOST perdu, CLOSED clôturé")
        ] = None,
        open: Annotated[
            bool | None, Field(description="true : affaires en cours (M0 à M5) ; false : terminées")
        ] = None,
        account_kind: Annotated[AccountKind | None, Field(description="Type de compte")] = None,
        lead: Annotated[
            str | None, Field(description="Responsable exact, ex. « Commercial IAT », « À confirmer »")
        ] = None,
        priority: Priority | None = None,
        due_before: Annotated[IsoDate | None, Field(description="Échéance au plus tard ce jour")] = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 50,
    ) -> dict:
        """Chercher des affaires du pipeline. Renvoie le numéro, l'étape, les montants et le lien de chacune ;
        get_deal donne le détail d'une affaire."""
        async with deps.api() as api:
            account_id = await Resolver(api).account_id(account)
            page = await api.get(
                "/deals",
                q=text,
                account_id=account_id,
                stage=stage,
                open=open,
                account_kind=account_kind,
                lead=lead,
                priority=priority,
                due_before=due_before,
                limit=limit,
            )
        deals = page["results"]
        return {
            "total": page["total"],
            "total_amount": sum(d.get("amount") or 0 for d in deals),
            "weighted_amount": sum(d.get("weighted_amount") or 0 for d in deals),
            "deals": [formatting.deal(settings, d) for d in deals],
        }

    @mcp.tool(annotations=READ_ONLY)
    async def get_deal(number: Annotated[int, Field(description="Numéro de l'affaire")]) -> dict:
        """Une affaire en détail, avec ses dernières modifications."""
        async with deps.api() as api:
            found = await Resolver(api).deal(number)
            history = await api.get("/activity", entity="deal", entity_id=found["id"], limit=10)
        return {
            **formatting.deal_full(settings, found),
            "history": [formatting.activity(e) for e in history["results"]],
        }

    @mcp.tool(annotations=READ_ONLY)
    async def list_accounts(
        text: Annotated[str | None, Field(description="Partie du nom ou du secteur")] = None,
        kind: AccountKind | None = None,
        followed_only: Annotated[
            bool, Field(description="true : seulement les comptes suivis avec une fiche complète")
        ] = False,
    ) -> list[dict]:
        """Les comptes : clients, prospects, partenaires et organismes d'appels d'offres."""
        async with deps.api() as api:
            page = await api.get("/accounts", q=text, kind=kind, has_fiche=True if followed_only else None, limit=500)
        return [formatting.account(settings, a) for a in page["results"]]

    @mcp.tool(annotations=READ_ONLY)
    async def get_account(account: AccountRef) -> dict:
        """La fiche complète d'un compte : interlocuteurs et état de santé, affaires, facturation et encaissements
        par exercice, renouvellements, pistes de développement, contacts et dirigeants."""
        async with deps.api() as api:
            found = await Resolver(api).account(account)
            data = await api.get(f"/accounts/{found['slug']}/overview")
        a = data["account"]
        fiche = {
            key: a.get(key)
            for key in (
                "display_name",
                "sector",
                "health",
                "satisfaction",
                "iat_lead",
                "executive_sponsor",
                "leadership_summary",
                "contact_direction",
                "contact_operational",
                "contact_purchasing",
                "last_contact",
                "next_meeting",
                "notes",
            )
            if a.get(key) not in (None, "")
        }
        return {
            **formatting.account(settings, a),
            "fiche": fiche,
            "deals": [formatting.deal(settings, d) for d in data["deals"]],
            "open_offers_amount": data["open_offers_amount"],
            "invoices": [formatting.invoice(i) for i in data["invoices"]],
            "invoice_totals": data["invoice_totals"],
            "renewals": [formatting.renewal(settings, r) for r in data["renewals"]],
            "opportunities": [formatting.opportunity(o) for o in data["opportunities"]],
            "contacts": [formatting.contact(settings, c) for c in data["contacts"][:40]],
        }

    @mcp.tool(annotations=READ_ONLY)
    async def list_renewals() -> list[dict]:
        """Les contrats récurrents, par échéance. Échéance = dernière facturation + 12 mois ; relances à J-90 et J-30 ;
        alerte : « Échu - urgent », « À relancer (≤ 90 j) », « À venir », « Date à confirmer », « Renouvelé », « Perdu »."""
        async with deps.api() as api:
            page = await api.get("/renewals", limit=500)
        return [formatting.renewal(settings, r) for r in page["results"]]

    @mcp.tool(annotations=READ_ONLY)
    async def search_actions(
        text: Annotated[str | None, Field(description="Mots de l'action, du sujet lié ou des commentaires")] = None,
        open: Annotated[
            bool | None, Field(description="true (défaut) : ni faites ni abandonnées ; false : terminées")
        ] = True,
        overdue: Annotated[bool | None, Field(description="true : seulement les actions en retard")] = None,
        owner: Annotated[str | None, Field(description="Responsable exact")] = None,
        priority: Priority | None = None,
        account: Annotated[str | None, Field(description="Nom du compte concerné")] = None,
        due_before: Annotated[IsoDate | None, Field(description="Échéance au plus tard ce jour")] = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 100,
    ) -> list[dict]:
        """Le plan d'actions : chaque action avec son numéro, son statut, son échéance et son lien."""
        async with deps.api() as api:
            account_id = await Resolver(api).account_id(account)
            page = await api.get(
                "/actions",
                q=text,
                open=open,
                overdue=overdue,
                owner=owner,
                priority=priority,
                account_id=account_id,
                due_before=due_before,
                limit=limit,
            )
        return [formatting.action(settings, a) for a in page["results"]]

    @mcp.tool(annotations=READ_ONLY)
    async def search_contacts(
        text: Annotated[str | None, Field(description="Nom, entreprise, fonction, e-mail ou téléphone")] = None,
        account: Annotated[str | None, Field(description="Nom du compte du pipeline")] = None,
        profile: Annotated[
            str | None,
            Field(
                description="Profil : Direction générale / métier, Direction SI / digital, Informatique / projets, "
                "Infrastructure / réseaux, Sécurité SI, Achats / marchés, Commercial / autre"
            ),
        ] = None,
        status: Annotated[
            str | None, Field(description="À contacter, Contacté, RDV obtenu, Coordonnées à vérifier…")
        ] = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 30,
    ) -> dict:
        """Chercher dans la base de contacts (base clients Côte d'Ivoire et dirigeants identifiés)."""
        async with deps.api() as api:
            account_id = await Resolver(api).account_id(account)
            page = await api.get(
                "/contacts", q=text, account_id=account_id, profile=profile, status=status, limit=limit
            )
        return {"total": page["total"], "contacts": [formatting.contact(settings, c) for c in page["results"]]}

    @mcp.tool(annotations=READ_ONLY)
    async def list_solutions() -> list[dict]:
        """Le catalogue : solutions vendues, partenaire, maîtrise commerciale, priorité et nombre de prospects."""
        async with deps.api() as api:
            page = await api.get("/solutions", limit=200)
        keys = (
            "id",
            "name",
            "vendor",
            "category",
            "partnership_status",
            "mastery",
            "priority",
            "target_sectors",
            "next_action",
            "prospects_count",
        )
        return [{k: s.get(k) for k in keys if s.get(k) not in (None, "")} for s in page["results"]]

    @mcp.tool(annotations=READ_ONLY)
    async def get_solution(
        solution: Annotated[str, Field(description="Nom de la solution, ex. Credolab, Wari+")],
    ) -> dict:
        """Une solution avec ses prospects (étape, semaine d'attaque, relation) et ses pitchs par segment."""
        async with deps.api() as api:
            found = await Resolver(api).solution(solution)
            prospects = await api.get("/prospects", solution_id=found["id"], limit=500)
            pitches = await api.get("/pitches", solution_id=found["id"], limit=50)
        return {
            **{k: v for k, v in found.items() if v not in (None, "") and k not in ("created_at", "updated_at")},
            "prospects": [formatting.prospect(p) for p in prospects["results"]],
            "pitches": [
                {
                    k: p[k]
                    for k in ("segment", "promise", "stake", "offer", "hook", "call_to_action", "targets")
                    if p.get(k)
                }
                for p in pitches["results"]
            ],
        }

    @mcp.tool(annotations=READ_ONLY)
    async def list_tenders() -> list[dict]:
        """Les appels d'offres suivis, avec leur date limite et le nombre de jours restants."""
        async with deps.api() as api:
            page = await api.get("/tenders", limit=200)
        return [formatting.tender(t) for t in page["results"]]

    @mcp.tool(annotations=READ_ONLY)
    async def recent_activity(
        via: Annotated[Literal["web", "api", "claude"] | None, Field(description="Canal : web, api ou claude")] = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 30,
    ) -> list[dict]:
        """Les dernières modifications : qui, quand, quoi, et par quel canal."""
        async with deps.api() as api:
            page = await api.get("/activity", via=via, limit=limit)
        return [formatting.activity(e) for e in page["results"]]
