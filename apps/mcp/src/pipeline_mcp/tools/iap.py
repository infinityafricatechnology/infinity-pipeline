"""Outils de l'espace IAP (Infinity Africa Properties, agence immobilière) : affaires, commissions,
plan d'actions et contacts. Routes `/iap/…` de l'API ; accès réservé aux comptes autorisés sur IAP.
"""

from typing import Annotated, Any, Literal

from fastmcp import FastMCP
from pydantic import BaseModel, Field

from ..api import PipelineAPI, PipelineAPIError
from ..config import Settings
from ..deps import Deps
from .read import READ_ONLY
from .write import DATE, MAX_BATCH, UPDATE, WRITE, ActionStatus, Amount, Priority, _batch, _created, _given

IapStage = Literal["P0", "P1", "P2", "P3", "P4", "P5", "LOST"]
STAGES_HELP = (
    "P0 mandat à signer, P1 mandat signé, P2 présenté / visites, P3 offre / négociation, "
    "P4 acompte / compromis, P5 conclu, LOST perdu"
)
Rate = Annotated[float, Field(ge=0, le=1, description="Taux de commission d'IAP entre 0 et 1 (0.025 = 2,5 %)")]
Closing = Annotated[float, Field(ge=0, le=1, description="Probabilité de conclusion entre 0 et 1 (0.6 = 60 %)")]
Person = Annotated[
    str | None,
    Field(description="Commercial ou apporteur : Koumba Assanvo, Serges Gnonblesson, Sali Traoré, Landry Digbeu…"),
]


def _keep(data: dict) -> dict:
    return {key: value for key, value in data.items() if value not in (None, "", [], {})}


def iap_deal(settings: Settings, d: dict, *, full: bool = False) -> dict:
    base = {
        "number": d["number"],
        "title": d["title"],
        "nature": d.get("nature"),
        "stage": d.get("stage_label"),
        "amount": d.get("amount"),
        "commission_rate": d.get("commission_rate"),
        "commission": d.get("commission"),
        "closing": d.get("closing"),
        "weighted_commission": d.get("weighted_commission"),
        "apporteur": d.get("apporteur"),
        "closeur": d.get("closeur") if d.get("closeur") != d.get("apporteur") else None,
        "due_date": d.get("due_date"),
        "overdue": d.get("overdue") or None,
        "next_step": d.get("next_step"),
        "url": f"{settings.web_url}/iap/affaires?affaire={d['number']}",
    }
    if full:
        base |= {
            "closeur": d.get("closeur"),
            "client": d.get("client"),
            "owner": d.get("owner"),
            "partner": d.get("partner"),
            "comments": d.get("comments"),
            "commission_received": d.get("commission_received"),
            "received_at": d.get("received_at"),
            "commission_split": {
                "base": d.get("commission_base"),
                "estimated": d.get("commission_estimated"),
                "shares": [
                    _keep({k: s.get(k) for k in ("person", "role", "rate", "amount", "status", "paid_at")})
                    for s in d.get("shares", [])
                ],
            },
        }
    return _keep(base)


def iap_action(settings: Settings, a: dict) -> dict:
    return _keep(
        {
            "number": a["number"],
            "title": a["title"],
            "status": a.get("status"),
            "priority": a.get("priority"),
            "due_date": a.get("due_date"),
            "overdue": a.get("overdue") or None,
            "owner": a.get("owner"),
            "deal": f"{a['deal_number']}. {a['deal_title']}" if a.get("deal_number") else None,
            "comments": a.get("comments"),
            "url": f"{settings.web_url}/iap/actions?action={a['number']}",
        }
    )


def iap_contact(settings: Settings, c: dict) -> dict:
    return _keep(
        {
            "id": c["id"],
            "name": c["name"],
            "role": c.get("role"),
            "company": c.get("company"),
            "phone": c.get("phone"),
            "email": c.get("email"),
            "notes": c.get("notes"),
            "url": f"{settings.web_url}/iap/contacts?contact={c['id']}",
        }
    )


async def _deal(api: PipelineAPI, number: int) -> dict:
    results = (await api.get("/iap/deals", number=number))["results"]
    if not results:
        raise PipelineAPIError(f"Aucune affaire IAP n° {number}. Utilisez iap_search_deals pour retrouver son numéro.")
    return results[0]


async def _action(api: PipelineAPI, number: int) -> dict:
    results = (await api.get("/iap/actions", number=number))["results"]
    if not results:
        raise PipelineAPIError(f"Aucune action IAP n° {number}. Utilisez iap_search_actions pour la retrouver.")
    return results[0]


# ---------- Modèles d'écriture ----------


class NewIapDeal(BaseModel):
    title: str = Field(min_length=1, description="Bien ou projet, ex. « Villa 800m² 7ème tranche »")
    nature: str | None = Field(
        None,
        description="Vente bien immobilier, Vente de terrain, Mandat de recherche, Mandat de gestion, Location, "
        "Construction",
    )
    stage: IapStage = Field("P0", description=STAGES_HELP)
    amount: Amount | None = None
    commission_rate: Rate | None = None
    closing: Closing | None = None
    due_date: str | None = Field(None, pattern=DATE, description="Date de closing estimée")
    apporteur: Person = None
    closeur: Person = None
    client: str | None = Field(None, description="Acquéreur ou locataire")
    owner: str | None = Field(None, description="Propriétaire du bien")
    partner: str | None = Field(None, description="Agence partenaire ou apporteur du client")
    next_step: str | None = None
    comments: str | None = None


class IapDealChanges(BaseModel):
    number: int = Field(description="Numéro de l'affaire IAP")
    title: str | None = Field(None, min_length=1)
    nature: str | None = None
    stage: IapStage | None = Field(None, description=STAGES_HELP)
    amount: Amount | None = None
    commission_rate: Rate | None = None
    closing: Closing | None = None
    due_date: str | None = Field(None, pattern=DATE)
    apporteur: Person = None
    closeur: Person = None
    client: str | None = None
    owner: str | None = None
    partner: str | None = None
    next_step: str | None = None
    comments: str | None = None
    commission_received: Amount | None = Field(None, description="Commission effectivement perçue par IAP")
    received_at: str | None = Field(None, pattern=DATE, description="Date d'encaissement de la commission")
    apport_paid_at: str | None = Field(None, pattern=DATE, description="Versement de la part apport (ou unique)")
    closing_paid_at: str | None = Field(None, pattern=DATE, description="Versement de la part closing")


class NewIapAction(BaseModel):
    title: str = Field(min_length=1)
    deal: int | None = Field(None, description="Numéro de l'affaire IAP concernée")
    due_date: str | None = Field(None, pattern=DATE)
    owner: Person = None
    priority: Priority | None = None
    status: ActionStatus = "À faire"
    comments: str | None = None


class IapActionChanges(BaseModel):
    number: int = Field(description="Numéro de l'action IAP")
    title: str | None = Field(None, min_length=1)
    status: ActionStatus | None = Field(None, description="« Fait » pour la cocher")
    deal: int | None = Field(None, description="Numéro de l'affaire IAP concernée")
    due_date: str | None = Field(None, pattern=DATE)
    owner: Person = None
    priority: Priority | None = None
    comments: str | None = None


ContactRole = Literal["Acquéreur", "Locataire", "Propriétaire", "Agence partenaire", "Apporteur d'affaires", "Autre"]


class NewIapContact(BaseModel):
    name: str = Field(min_length=1)
    role: ContactRole | None = None
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = Field(None, description="Recherche, budget, biens présentés…")


class IapContactChanges(BaseModel):
    id: int = Field(description="Identifiant du contact (iap_search_contacts)")
    name: str | None = Field(None, min_length=1)
    role: ContactRole | None = None
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = None


def register_iap_tools(mcp: FastMCP, deps: Deps) -> None:
    settings = deps.settings

    # ---------- Lecture ----------

    @mcp.tool(annotations=READ_ONLY)
    async def iap_overview() -> dict:
        """IAP (immobilier) : synthèse du portefeuille de biens, commissions attendues / pondérées / perçues,
        parts à verser aux commerciaux, répartition par étape et par commercial, actions à traiter cette semaine."""
        async with deps.api() as api:
            summary = await api.get("/iap/summary")
            agenda = await api.get("/iap/agenda", days=7)
        return {
            "as_of": summary["as_of"],
            "pipeline": summary["pipeline"],
            "commission_shares": summary["commissions"],
            "by_stage": [
                {k: g[k] for k in ("label", "count", "amount", "commission", "weighted_commission")}
                for g in summary["by_stage"]
                if g["count"]
            ],
            "by_person": [
                {k: g[k] for k in ("key", "count", "amount", "commission", "weighted_commission")}
                for g in summary["by_person"]
            ],
            "this_week": {
                "actions": [iap_action(settings, a) for a in agenda["actions"]],
                "closings": [iap_deal(settings, d) for d in agenda["deals"]],
            },
            "url": f"{settings.web_url}/iap",
        }

    @mcp.tool(annotations=READ_ONLY)
    async def iap_search_deals(
        text: Annotated[
            str | None, Field(description="Mots du bien, du client, du propriétaire, des commentaires")
        ] = None,
        stage: Annotated[IapStage | None, Field(description=STAGES_HELP)] = None,
        person: Annotated[str | None, Field(description="Commercial, apporteur ou closeur (nom exact)")] = None,
        nature: str | None = None,
        open: Annotated[bool | None, Field(description="true : affaires en cours (P0 à P4)")] = None,
        due_before: Annotated[
            str | None, Field(pattern=DATE, description="Closing estimé au plus tard ce jour")
        ] = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 50,
    ) -> dict:
        """IAP : chercher des affaires immobilières. Renvoie le numéro, l'étape, le montant, la commission et le lien ;
        iap_get_deal donne le détail et la répartition de la commission."""
        async with deps.api() as api:
            page = await api.get(
                "/iap/deals",
                q=text,
                stage=stage,
                person=person,
                nature=nature,
                open=open,
                due_before=due_before,
                limit=limit,
            )
        deals = page["results"]
        return {
            "total": page["total"],
            "total_amount": sum(d.get("amount") or 0 for d in deals),
            "total_commission": sum(d.get("commission") or 0 for d in deals),
            "weighted_commission": sum(d.get("weighted_commission") or 0 for d in deals),
            "deals": [iap_deal(settings, d) for d in deals],
        }

    @mcp.tool(annotations=READ_ONLY)
    async def iap_get_deal(number: Annotated[int, Field(description="Numéro de l'affaire IAP")]) -> dict:
        """IAP : une affaire en détail, avec client, propriétaire, commentaires et répartition de la commission
        entre apporteur et closeur (base perçue ou estimée, statut versé / à verser)."""
        async with deps.api() as api:
            found = await _deal(api, number)
            actions = (await api.get("/iap/actions", deal_id=found["id"], limit=50))["results"]
        return {**iap_deal(settings, found, full=True), "actions": [iap_action(settings, a) for a in actions]}

    @mcp.tool(annotations=READ_ONLY)
    async def iap_commissions(
        person: Annotated[str | None, Field(description="Bénéficiaire (nom exact)")] = None,
        status: Annotated[
            Literal["due", "paid", "expected"] | None,
            Field(description="due : à verser (IAP a perçu) ; paid : versée ; expected : estimation"),
        ] = None,
    ) -> dict:
        """IAP : commissions des commerciaux et apporteurs selon la fiche de commissionnement (apport 5 %, closing 10 %,
        15 % si la même personne apporte et conclut, sur la commission perçue par IAP). Total par bénéficiaire et détail."""
        async with deps.api() as api:
            data = await api.get("/iap/commissions", person=person, status=status)
        return {
            "policy": data["policy"],
            "totals": data["totals"],
            "people": data["people"],
            "shares": [
                _keep(
                    {
                        "deal": f"{r['deal_number']}. {r['deal_title']}",
                        "person": r["person"],
                        "role": r["role"],
                        "rate": r["rate"],
                        "base": r["base"],
                        "estimated": r["estimated"] or None,
                        "amount": r["amount"],
                        "status": r["status"],
                        "paid_at": r.get("paid_at"),
                    }
                )
                for r in data["results"]
            ],
            "url": f"{settings.web_url}/iap/commissions",
        }

    @mcp.tool(annotations=READ_ONLY)
    async def iap_search_actions(
        text: str | None = None,
        open: Annotated[bool | None, Field(description="true : actions ni faites ni abandonnées")] = True,
        overdue: bool | None = None,
        owner: str | None = None,
        deal: Annotated[int | None, Field(description="Numéro de l'affaire IAP")] = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 50,
    ) -> dict:
        """IAP : chercher dans le plan d'actions (relances, visites, signatures de mandat…)."""
        async with deps.api() as api:
            deal_id = (await _deal(api, deal))["id"] if deal else None
            page = await api.get(
                "/iap/actions", q=text, open=open, overdue=overdue, owner=owner, deal_id=deal_id, limit=limit
            )
        return {"total": page["total"], "actions": [iap_action(settings, a) for a in page["results"]]}

    @mcp.tool(annotations=READ_ONLY)
    async def iap_search_contacts(
        text: Annotated[str | None, Field(description="Nom, société, téléphone, e-mail")] = None,
        role: ContactRole | None = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 30,
    ) -> dict:
        """IAP : chercher des acquéreurs, locataires, propriétaires, agences partenaires ou apporteurs."""
        async with deps.api() as api:
            page = await api.get("/iap/contacts", q=text, role=role, limit=limit)
        return {"total": page["total"], "contacts": [iap_contact(settings, c) for c in page["results"]]}

    # ---------- Écriture ----------

    @mcp.tool(annotations=WRITE)
    async def iap_create_deals(deals: Annotated[list[NewIapDeal], Field(min_length=1, max_length=MAX_BATCH)]) -> dict:
        """IAP : ajouter des affaires immobilières (100 au plus, tout ou rien). Numéro attribué automatiquement."""
        async with deps.api() as api:
            results = await _batch(api, "post", "iap/deals", [_created(d) for d in deals])
        return {"created": [iap_deal(settings, d) for d in results]}

    @mcp.tool(annotations=UPDATE)
    async def iap_update_deals(
        changes: Annotated[list[IapDealChanges], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """IAP : modifier des affaires par leur numéro (étape, closing, montant, taux, apporteur / closeur, commission
        perçue, dates de versement des parts…). Seuls les champs donnés changent ; `null` efface une valeur."""
        async with deps.api() as api:
            items = [{"id": (await _deal(api, c.number))["id"], **_given(c, "number")} for c in changes]
            results = await _batch(api, "patch", "iap/deals", items)
        return {"updated": [iap_deal(settings, d) for d in results]}

    async def _action_item(
        api: PipelineAPI, model: NewIapAction | IapActionChanges, given: dict[str, Any]
    ) -> dict[str, Any]:
        item = {k: v for k, v in given.items() if k != "deal"}
        if "deal" in model.model_fields_set:
            number = model.deal
            item["deal_id"] = (await _deal(api, number))["id"] if number else None
        return item

    @mcp.tool(annotations=WRITE)
    async def iap_create_actions(
        actions: Annotated[list[NewIapAction], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """IAP : ajouter des actions au plan d'actions, rattachées le cas échéant à une affaire par son numéro."""
        async with deps.api() as api:
            items = [await _action_item(api, a, _created(a)) for a in actions]
            results = await _batch(api, "post", "iap/actions", items)
        return {"created": [iap_action(settings, a) for a in results]}

    @mcp.tool(annotations=UPDATE)
    async def iap_update_actions(
        changes: Annotated[list[IapActionChanges], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """IAP : modifier des actions par leur numéro ; status « Fait » pour les cocher."""
        async with deps.api() as api:
            items = []
            for change in changes:
                found = await _action(api, change.number)
                items.append({"id": found["id"], **(await _action_item(api, change, _given(change, "number")))})
            results = await _batch(api, "patch", "iap/actions", items)
        return {"updated": [iap_action(settings, a) for a in results]}

    @mcp.tool(annotations=WRITE)
    async def iap_create_contacts(
        contacts: Annotated[list[NewIapContact], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """IAP : ajouter des contacts (acquéreurs, locataires, propriétaires, agences, apporteurs)."""
        async with deps.api() as api:
            results = await _batch(api, "post", "iap/contacts", [_created(c) for c in contacts])
        return {"created": [iap_contact(settings, c) for c in results]}

    @mcp.tool(annotations=UPDATE)
    async def iap_update_contacts(
        changes: Annotated[list[IapContactChanges], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """IAP : modifier des contacts par leur identifiant. Seuls les champs donnés changent."""
        async with deps.api() as api:
            results = await _batch(api, "patch", "iap/contacts", [_given(c) for c in changes])
        return {"updated": [iap_contact(settings, c) for c in results]}
