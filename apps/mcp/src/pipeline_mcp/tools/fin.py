"""Outils des espaces IAC (Infinity Africa Capital, mobilisation de capitaux) et IAF (Infinity Africa Finance,
financement) : affaires, encaissements, plan d'actions et contacts. Les deux filiales ont le même modèle ; chaque
outil prend `space` (« iac » ou « iaf ») et appelle les routes `/iac/…` ou `/iaf/…` de l'API.
"""

from typing import Annotated, Any, Literal

from fastmcp import FastMCP
from pydantic import BaseModel, Field

from ..api import PipelineAPI, PipelineAPIError
from ..config import Settings
from ..deps import Deps
from .read import READ_ONLY
from .write import DATE, MAX_BATCH, UPDATE, WRITE, ActionStatus, Amount, Priority, _batch, _created, _given

FinSpace = Literal["iac", "iaf"]
SpaceArg = Annotated[
    FinSpace, Field(description="Filiale : iac (Infinity Africa Capital, mobilisation de capitaux) ou iaf (Infinity Africa Finance, financement)")
]
FinStage = Literal["F0", "F1", "F2", "F3", "F4", "F5", "LOST"]
STAGES_HELP = (
    "F0 prospection, F1 étude de faisabilité / documents, F2 mandat signé, F3 structuration / dossier transmis, "
    "F4 financement obtenu à recouvrer, F5 encaissé, LOST perdu"
)
Rate = Annotated[float, Field(ge=0, le=1, description="Taux de la commission de succès entre 0 et 1 (0.025 = 2,5 %)")]
Closing = Annotated[float, Field(ge=0, le=1, description="Probabilité de closing entre 0 et 1 (0.6 = 60 %)")]


def _keep(data: dict) -> dict:
    return {key: value for key, value in data.items() if value not in (None, "", [], {})}


def fin_deal(settings: Settings, space: str, d: dict, *, full: bool = False) -> dict:
    base = {
        "number": d["number"],
        "title": d["title"],
        "nature": d.get("nature"),
        "sector": d.get("sector"),
        "stage": d.get("stage_label"),
        "priority": d.get("priority"),
        "amount": d.get("amount"),
        "fee": d.get("fee"),
        "commission_rate": d.get("commission_rate"),
        "commission": d.get("commission"),
        "revenue": d.get("revenue"),
        "closing": d.get("closing"),
        "weighted_revenue": d.get("weighted_revenue"),
        "outstanding": d.get("outstanding") or None,
        "owner": d.get("owner"),
        "due_date": d.get("due_date"),
        "overdue": d.get("overdue") or None,
        "next_step": d.get("next_step"),
        "url": f"{settings.web_url}/{space}/affaires?affaire={d['number']}",
    }
    if full:
        base |= {
            "apporteur": d.get("apporteur"),
            "comments": d.get("comments"),
            "fee_received": d.get("fee_received"),
            "fee_received_at": d.get("fee_received_at"),
            "fee_outstanding": d.get("fee_outstanding"),
            "commission_received": d.get("commission_received"),
            "commission_received_at": d.get("commission_received_at"),
            "commission_outstanding": d.get("commission_outstanding"),
        }
    return _keep(base)


def fin_action(settings: Settings, space: str, a: dict) -> dict:
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
            "url": f"{settings.web_url}/{space}/actions?action={a['number']}",
        }
    )


def fin_contact(settings: Settings, space: str, c: dict) -> dict:
    return _keep(
        {
            "id": c["id"],
            "name": c["name"],
            "role": c.get("role"),
            "company": c.get("company"),
            "phone": c.get("phone"),
            "email": c.get("email"),
            "notes": c.get("notes"),
            "url": f"{settings.web_url}/{space}/contacts?contact={c['id']}",
        }
    )


async def _deal(api: PipelineAPI, space: str, number: int) -> dict:
    results = (await api.get(f"/{space}/deals", number=number))["results"]
    if not results:
        raise PipelineAPIError(
            f"Aucune affaire {space.upper()} n° {number}. Utilisez fin_search_deals pour retrouver son numéro."
        )
    return results[0]


async def _action(api: PipelineAPI, space: str, number: int) -> dict:
    results = (await api.get(f"/{space}/actions", number=number))["results"]
    if not results:
        raise PipelineAPIError(f"Aucune action {space.upper()} n° {number}. Utilisez fin_search_actions pour la retrouver.")
    return results[0]


# ---------- Modèles d'écriture ----------


class NewFinDeal(BaseModel):
    title: str = Field(min_length=1, description="Entreprise ou projet, ex. « HYBA ENTREPRISE »")
    nature: str | None = Field(
        None,
        description="Mobilisation de capitaux, Levée de fonds Dette, Levée de fonds Equity, Leasing, Restructuration, "
        "Cession de parts…",
    )
    sector: str | None = Field(None, description="Domaine du client : Santé, Énergie, Hydrocarbures, Microfinance…")
    stage: FinStage = Field("F0", description=STAGES_HELP)
    amount: Amount | None = Field(None, description="Montant de la demande (capitaux ou financement recherchés), en FCFA")
    fee: Amount | None = Field(None, description="Honoraire forfaitaire facturé au client, en FCFA")
    commission_rate: Rate | None = None
    closing: Closing | None = None
    due_date: str | None = Field(None, pattern=DATE, description="Date de closing estimée")
    owner: str | None = Field(None, description="Responsable de l'affaire")
    apporteur: str | None = Field(None, description="Personne ou partenaire qui a apporté l'affaire")
    priority: int | None = Field(None, ge=1, description="Rang de priorité (1 = la plus prioritaire)")
    next_step: str | None = None
    comments: str | None = None


class FinDealChanges(BaseModel):
    number: int = Field(description="Numéro de l'affaire dans la filiale")
    title: str | None = Field(None, min_length=1)
    nature: str | None = None
    sector: str | None = None
    stage: FinStage | None = Field(None, description=STAGES_HELP)
    amount: Amount | None = None
    fee: Amount | None = None
    commission_rate: Rate | None = None
    closing: Closing | None = None
    due_date: str | None = Field(None, pattern=DATE)
    owner: str | None = None
    apporteur: str | None = None
    priority: int | None = Field(None, ge=1)
    next_step: str | None = None
    comments: str | None = None
    fee_received: Amount | None = Field(None, description="Part de l'honoraire encaissée (cumul)")
    fee_received_at: str | None = Field(None, pattern=DATE, description="Date du dernier encaissement d'honoraire")
    commission_received: Amount | None = Field(None, description="Commission de succès encaissée (cumul)")
    commission_received_at: str | None = Field(None, pattern=DATE, description="Date du dernier encaissement de commission")


class NewFinAction(BaseModel):
    title: str = Field(min_length=1)
    deal: int | None = Field(None, description="Numéro de l'affaire concernée")
    due_date: str | None = Field(None, pattern=DATE)
    owner: str | None = None
    priority: Priority | None = None
    status: ActionStatus = "À faire"
    comments: str | None = None


class FinActionChanges(BaseModel):
    number: int = Field(description="Numéro de l'action")
    title: str | None = Field(None, min_length=1)
    status: ActionStatus | None = Field(None, description="« Fait » pour la cocher")
    deal: int | None = Field(None, description="Numéro de l'affaire concernée")
    due_date: str | None = Field(None, pattern=DATE)
    owner: str | None = None
    priority: Priority | None = None
    comments: str | None = None


ContactRole = Literal["Dirigeant client", "Banque / bailleur", "Investisseur", "Partenaire", "Conseil", "Autre"]


class NewFinContact(BaseModel):
    name: str = Field(min_length=1)
    role: ContactRole | None = None
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = None


class FinContactChanges(BaseModel):
    id: int = Field(description="Identifiant du contact (fin_search_contacts)")
    name: str | None = Field(None, min_length=1)
    role: ContactRole | None = None
    company: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = None


def register_fin_tools(mcp: FastMCP, deps: Deps) -> None:
    settings = deps.settings

    # ---------- Lecture ----------

    @mcp.tool(annotations=READ_ONLY)
    async def fin_overview(space: SpaceArg) -> dict:
        """IAC ou IAF : synthèse du pipeline (montants recherchés, revenus attendus = honoraires + commissions de succès,
        pondéré, encaissé, reste à recouvrer), répartition par étape et par domaine, actions de la semaine."""
        async with deps.api() as api:
            summary = await api.get(f"/{space}/summary")
            agenda = await api.get(f"/{space}/agenda", days=7)
        keys = ("count", "amount", "fee", "commission", "weighted_revenue")
        return {
            "as_of": summary["as_of"],
            "pipeline": summary["pipeline"],
            "cash": summary["cash"],
            "by_stage": [{"label": g["label"], **{k: g[k] for k in keys}} for g in summary["by_stage"] if g["count"]],
            "by_sector": [{"key": g["key"], **{k: g[k] for k in keys}} for g in summary["by_sector"]],
            "this_week": {
                "actions": [fin_action(settings, space, a) for a in agenda["actions"]],
                "closings": [fin_deal(settings, space, d) for d in agenda["deals"]],
            },
            "url": f"{settings.web_url}/{space}",
        }

    @mcp.tool(annotations=READ_ONLY)
    async def fin_search_deals(
        space: SpaceArg,
        text: Annotated[str | None, Field(description="Mots de l'entreprise, des commentaires, de la prochaine étape")] = None,
        stage: Annotated[FinStage | None, Field(description=STAGES_HELP)] = None,
        sector: Annotated[str | None, Field(description="Domaine (nom exact)")] = None,
        nature: str | None = None,
        owner: Annotated[str | None, Field(description="Responsable (nom exact)")] = None,
        open: Annotated[bool | None, Field(description="true : affaires en cours (F0 à F4)")] = None,
        outstanding: Annotated[bool | None, Field(description="true : honoraire ou commission restant à encaisser")] = None,
        due_before: Annotated[str | None, Field(pattern=DATE, description="Closing estimé au plus tard ce jour")] = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 50,
    ) -> dict:
        """IAC ou IAF : chercher des affaires. Renvoie numéro, étape, montant demandé, honoraire, commission de succès,
        revenu attendu, reste à encaisser et lien ; fin_get_deal donne le détail des encaissements."""
        async with deps.api() as api:
            page = await api.get(
                f"/{space}/deals",
                q=text,
                stage=stage,
                sector=sector,
                nature=nature,
                owner=owner,
                open=open,
                outstanding=outstanding,
                due_before=due_before,
                limit=limit,
            )
        deals = page["results"]
        return {
            "total": page["total"],
            "total_amount": sum(d.get("amount") or 0 for d in deals),
            "total_revenue": sum(d.get("revenue") or 0 for d in deals),
            "weighted_revenue": sum(d.get("weighted_revenue") or 0 for d in deals),
            "outstanding": sum(d.get("outstanding") or 0 for d in deals),
            "deals": [fin_deal(settings, space, d) for d in deals],
        }

    @mcp.tool(annotations=READ_ONLY)
    async def fin_get_deal(space: SpaceArg, number: Annotated[int, Field(description="Numéro de l'affaire")]) -> dict:
        """IAC ou IAF : une affaire en détail (commentaires, honoraire et commission encaissés / restant dus, actions)."""
        async with deps.api() as api:
            found = await _deal(api, space, number)
            actions = (await api.get(f"/{space}/actions", deal_id=found["id"], limit=50))["results"]
        return {**fin_deal(settings, space, found, full=True), "actions": [fin_action(settings, space, a) for a in actions]}

    @mcp.tool(annotations=READ_ONLY)
    async def fin_recovery(space: SpaceArg) -> dict:
        """IAC ou IAF : honoraires et commissions de succès restant à recouvrer, affaire par affaire (plus gros d'abord).
        La commission n'est due qu'une fois le financement obtenu (F4, F5)."""
        async with deps.api() as api:
            data = await api.get(f"/{space}/recovery")
        return {
            "totals": data["totals"],
            "deals": [
                _keep(
                    {
                        "deal": f"{r['deal_number']}. {r['deal_title']}",
                        "stage": r["stage_label"],
                        "fee_outstanding": r["fee_outstanding"] or None,
                        "commission_outstanding": r["commission_outstanding"] or None,
                        "outstanding": r["outstanding"],
                        "received": (r["fee_received"] + r["commission_received"]) or None,
                        "next_step": r.get("next_step"),
                    }
                )
                for r in data["results"]
            ],
            "url": f"{settings.web_url}/{space}/encaissements",
        }

    @mcp.tool(annotations=READ_ONLY)
    async def fin_search_actions(
        space: SpaceArg,
        text: str | None = None,
        open: Annotated[bool | None, Field(description="true : actions ni faites ni abandonnées")] = True,
        overdue: bool | None = None,
        owner: str | None = None,
        deal: Annotated[int | None, Field(description="Numéro de l'affaire")] = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 50,
    ) -> dict:
        """IAC ou IAF : chercher dans le plan d'actions (signature de mandat, étude de faisabilité, recouvrement…)."""
        async with deps.api() as api:
            deal_id = (await _deal(api, space, deal))["id"] if deal else None
            page = await api.get(
                f"/{space}/actions", q=text, open=open, overdue=overdue, owner=owner, deal_id=deal_id, limit=limit
            )
        return {"total": page["total"], "actions": [fin_action(settings, space, a) for a in page["results"]]}

    @mcp.tool(annotations=READ_ONLY)
    async def fin_search_contacts(
        space: SpaceArg,
        text: Annotated[str | None, Field(description="Nom, société, téléphone, e-mail")] = None,
        role: ContactRole | None = None,
        limit: Annotated[int, Field(ge=1, le=200)] = 30,
    ) -> dict:
        """IAC ou IAF : chercher des dirigeants clients, banques et bailleurs, investisseurs ou partenaires."""
        async with deps.api() as api:
            page = await api.get(f"/{space}/contacts", q=text, role=role, limit=limit)
        return {"total": page["total"], "contacts": [fin_contact(settings, space, c) for c in page["results"]]}

    # ---------- Écriture ----------

    @mcp.tool(annotations=WRITE)
    async def fin_create_deals(
        space: SpaceArg, deals: Annotated[list[NewFinDeal], Field(min_length=1, max_length=MAX_BATCH)]
    ) -> dict:
        """IAC ou IAF : ajouter des affaires (100 au plus, tout ou rien). Numéro attribué automatiquement."""
        async with deps.api() as api:
            results = await _batch(api, "post", f"{space}/deals", [_created(d) for d in deals])
        return {"created": [fin_deal(settings, space, d) for d in results]}

    @mcp.tool(annotations=UPDATE)
    async def fin_update_deals(
        space: SpaceArg, changes: Annotated[list[FinDealChanges], Field(min_length=1, max_length=MAX_BATCH)]
    ) -> dict:
        """IAC ou IAF : modifier des affaires par leur numéro (étape, closing, montant, honoraire, taux, encaissements…).
        Les montants encaissés sont des cumuls. Seuls les champs donnés changent ; `null` efface une valeur."""
        async with deps.api() as api:
            items = [{"id": (await _deal(api, space, c.number))["id"], **_given(c, "number")} for c in changes]
            results = await _batch(api, "patch", f"{space}/deals", items)
        return {"updated": [fin_deal(settings, space, d) for d in results]}

    async def _action_item(
        api: PipelineAPI, space: str, model: NewFinAction | FinActionChanges, given: dict[str, Any]
    ) -> dict[str, Any]:
        item = {k: v for k, v in given.items() if k != "deal"}
        if "deal" in model.model_fields_set:
            number = model.deal
            item["deal_id"] = (await _deal(api, space, number))["id"] if number else None
        return item

    @mcp.tool(annotations=WRITE)
    async def fin_create_actions(
        space: SpaceArg, actions: Annotated[list[NewFinAction], Field(min_length=1, max_length=MAX_BATCH)]
    ) -> dict:
        """IAC ou IAF : ajouter des actions au plan d'actions, rattachées le cas échéant à une affaire par son numéro."""
        async with deps.api() as api:
            items = [await _action_item(api, space, a, _created(a)) for a in actions]
            results = await _batch(api, "post", f"{space}/actions", items)
        return {"created": [fin_action(settings, space, a) for a in results]}

    @mcp.tool(annotations=UPDATE)
    async def fin_update_actions(
        space: SpaceArg, changes: Annotated[list[FinActionChanges], Field(min_length=1, max_length=MAX_BATCH)]
    ) -> dict:
        """IAC ou IAF : modifier des actions par leur numéro ; status « Fait » pour les cocher."""
        async with deps.api() as api:
            items = []
            for change in changes:
                found = await _action(api, space, change.number)
                items.append({"id": found["id"], **(await _action_item(api, space, change, _given(change, "number")))})
            results = await _batch(api, "patch", f"{space}/actions", items)
        return {"updated": [fin_action(settings, space, a) for a in results]}

    @mcp.tool(annotations=WRITE)
    async def fin_create_contacts(
        space: SpaceArg, contacts: Annotated[list[NewFinContact], Field(min_length=1, max_length=MAX_BATCH)]
    ) -> dict:
        """IAC ou IAF : ajouter des contacts (dirigeants clients, banques, investisseurs, partenaires)."""
        async with deps.api() as api:
            results = await _batch(api, "post", f"{space}/contacts", [_created(c) for c in contacts])
        return {"created": [fin_contact(settings, space, c) for c in results]}

    @mcp.tool(annotations=UPDATE)
    async def fin_update_contacts(
        space: SpaceArg, changes: Annotated[list[FinContactChanges], Field(min_length=1, max_length=MAX_BATCH)]
    ) -> dict:
        """IAC ou IAF : modifier des contacts par leur identifiant. Seuls les champs donnés changent."""
        async with deps.api() as api:
            results = await _batch(api, "patch", f"{space}/contacts", [_given(c) for c in changes])
        return {"updated": [fin_contact(settings, space, c) for c in results]}
