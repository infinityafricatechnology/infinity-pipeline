"""Outils de l'espace Groupe (IAG) : vue consolidée des filiales et partenaires stratégiques. Routes `/groupe/…`
de l'API ; accès réservé aux comptes autorisés sur l'espace Groupe."""

from typing import Annotated, Literal

from fastmcp import FastMCP
from pydantic import BaseModel, Field

from ..config import Settings
from ..deps import Deps
from .read import READ_ONLY
from .write import DATE, MAX_BATCH, UPDATE, WRITE, Amount, Priority, _batch, _created, _given

Entity = Literal["Groupe", "IAT", "IAP", "IAC", "IAF"]
Potential = Literal["Élevé", "Moyen", "Faible"]


def _keep(data: dict) -> dict:
    return {key: value for key, value in data.items() if value not in (None, "", [], {})}


def partner(settings: Settings, p: dict, *, full: bool = False) -> dict:
    base = {
        "id": p["id"],
        "name": p["name"],
        "entity": p.get("entity"),
        "type": p.get("type"),
        "potential": p.get("potential"),
        "priority": p.get("priority"),
        "iag_referent": p.get("iag_referent"),
        "partner_referent": p.get("partner_referent"),
        "next_action": p.get("next_action"),
        "due_date": p.get("due_date"),
        "overdue": p.get("overdue") or None,
        "potential_revenue": p.get("potential_revenue"),
        "url": f"{settings.web_url}/groupe/partenaires?partenaire={p['id']}",
    }
    if full:
        base |= {
            k: p.get(k)
            for k in (
                "zone",
                "expertise",
                "complementarity",
                "market_access",
                "model",
                "relationship",
                "legal_status",
                "opportunities",
                "margin",
                "last_interaction",
                "risks",
            )
        }
    return _keep(base)


class PartnerFields(BaseModel):
    entity: Entity | None = Field(None, description="Entité du groupe concernée")
    type: str | None = Field(None, description="Fintech, Opérateur, Éditeur, Immobilier, Conseil…")
    zone: str | None = None
    expertise: str | None = None
    complementarity: str | None = Field(None, description="Complémentarité avec IAG")
    market_access: str | None = Field(None, description="Accès marché / clients")
    potential: Potential | None = None
    model: str | None = Field(None, description="Modèle de partenariat (co-vente, intégration, apport d'affaires…)")
    relationship: str | None = Field(None, description="Niveau de relation")
    legal_status: str | None = Field(None, description="Statut juridique / NDA")
    iag_referent: str | None = None
    partner_referent: str | None = None
    opportunities: str | None = Field(None, description="Opportunités conjointes")
    potential_revenue: Amount | None = Field(None, description="CA potentiel en FCFA")
    margin: str | None = Field(None, description="Marge ou commission IAG")
    last_interaction: str | None = Field(None, pattern=DATE)
    next_action: str | None = None
    due_date: str | None = Field(None, pattern=DATE, description="Échéance de la prochaine action")
    priority: Priority | None = None
    risks: str | None = None


class NewPartner(PartnerFields):
    name: str = Field(min_length=1)


class PartnerChanges(PartnerFields):
    id: int = Field(description="Identifiant du partenaire (partners_search)")
    name: str | None = Field(None, min_length=1)


def register_group_tools(mcp: FastMCP, deps: Deps) -> None:
    settings = deps.settings

    @mcp.tool(annotations=READ_ONLY)
    async def group_overview() -> dict:
        """Groupe IAG : vue consolidée des filiales accessibles (IAT, IAP, IAC, IAF) — affaires en cours, pipeline,
        pondéré, revenu attendu (marge IAT, commission IAP, honoraire + commission IAC/IAF), encaissé — et état des
        partenariats (potentiel élevé, priorité P1, échéances dépassées)."""
        async with deps.api() as api:
            data = await api.get("/groupe/summary")
        return {**data, "url": f"{settings.web_url}/groupe"}

    @mcp.tool(annotations=READ_ONLY)
    async def partners_search(
        text: Annotated[str | None, Field(description="Nom, expertise, référent, opportunité, prochaine action")] = None,
        entity: Entity | None = None,
        potential: Potential | None = None,
        priority: Priority | None = None,
        referent: Annotated[str | None, Field(description="Référent IAG")] = None,
        overdue: Annotated[bool | None, Field(description="true : échéance de la prochaine action dépassée")] = None,
        full: Annotated[bool, Field(description="true : toutes les colonnes de la cartographie")] = False,
        limit: Annotated[int, Field(ge=1, le=200)] = 50,
    ) -> dict:
        """Groupe IAG : chercher dans la cartographie des partenaires stratégiques, triés par priorité puis échéance."""
        async with deps.api() as api:
            page = await api.get(
                "/groupe/partners",
                q=text,
                entity=entity,
                potential=potential,
                priority=priority,
                referent=referent,
                overdue=overdue,
                limit=limit,
            )
        return {"total": page["total"], "partners": [partner(settings, p, full=full) for p in page["results"]]}

    @mcp.tool(annotations=WRITE)
    async def partners_create(
        partners: Annotated[list[NewPartner], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """Groupe IAG : ajouter des partenaires à la cartographie (100 au plus, tout ou rien)."""
        async with deps.api() as api:
            results = await _batch(api, "post", "groupe/partners", [_created(p) for p in partners])
        return {"created": [partner(settings, p) for p in results]}

    @mcp.tool(annotations=UPDATE)
    async def partners_update(
        changes: Annotated[list[PartnerChanges], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """Groupe IAG : modifier des partenaires par leur identifiant (prochaine action, échéance, dernière interaction,
        potentiel…). Seuls les champs donnés changent ; `null` efface une valeur."""
        async with deps.api() as api:
            results = await _batch(api, "patch", "groupe/partners", [_given(c) for c in changes])
        return {"updated": [partner(settings, p, full=True) for p in results]}
