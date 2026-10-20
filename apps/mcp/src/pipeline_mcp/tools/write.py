"""Outils d'écriture : affaires, actions, renouvellements, comptes, contacts, facturation, prospects.

Chaque outil groupé envoie un seul appel `/batch` à l'API : tout ou rien. Dans les modifications, seuls les champs
fournis changent ; `null` efface une valeur.
"""

from typing import Annotated, Any, Literal

from fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field

from .. import formatting
from ..api import PipelineAPI, PipelineAPIError
from ..deps import Deps
from ..resolve import Resolver

WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False)
UPDATE = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=False)
DELETE = ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False)

MAX_BATCH = 100
StageCode = Literal["M0", "M1", "M2", "M3", "M4", "M5", "M6", "LOST", "CLOSED"]
Priority = Literal["P1", "P2", "P3"]
ActionStatus = Literal["À faire", "En cours", "Bloqué", "Fait", "Abandonné"]
RenewalStatus = Literal[
    "Non démarré", "Attente cotation fournisseur", "Offre envoyée", "Accord client", "Renouvelé", "Perdu"
]
ContactStatus = Literal["À contacter", "Contacté", "RDV obtenu", "Coordonnées à vérifier", "Ne plus contacter"]
Recurrence = Literal["Récurrent", "Ponctuel", "Mixte"]
DATE = r"^\d{4}-\d{2}-\d{2}$"
Amount = Annotated[int, Field(ge=0, description="Montant en FCFA")]
Closing = Annotated[float, Field(ge=0, le=1, description="Probabilité de signature entre 0 et 1 (0.6 = 60 %)")]


# ---------- Modèles ----------


class NewDeal(BaseModel):
    account: str = Field(description="Nom du compte (existant ; sinon le créer avec create_accounts)")
    title: str = Field(min_length=1, description="Nature de l'affaire")
    stage: StageCode = Field(
        "M0",
        description="M0 à qualifier, M1 besoin identifié, M2 cadrage, M3 offre en préparation, "
        "M4 offre remise, M5 négociation / signature, M6 gagné, LOST perdu, CLOSED clôturé",
    )
    priority: Priority | None = None
    closing: Closing | None = None
    amount: Amount | None = None
    commission: Amount | None = None
    due_date: str | None = Field(None, pattern=DATE)
    next_step: str | None = None
    lead: str | None = Field(
        None,
        description="Responsable : Commercial IAT, Fadel Koloma / Salim Kone, Maoula, Direction générale, À confirmer",
    )
    solution: str | None = Field(None, description="Solution / partenaire")
    service: str | None = Field(None, description="Service IAT proposé")
    origin: str | None = None
    recurrence: Recurrence | None = None
    key_contact: str | None = None
    comments: str | None = None


class DealChanges(BaseModel):
    number: int = Field(description="Numéro de l'affaire")
    account: str | None = Field(None, description="Nouveau compte, par son nom")
    title: str | None = Field(None, min_length=1)
    stage: StageCode | None = None
    priority: Priority | None = None
    closing: Closing | None = None
    amount: Amount | None = None
    commission: Amount | None = None
    due_date: str | None = Field(None, pattern=DATE)
    next_step: str | None = None
    lead: str | None = None
    solution: str | None = None
    service: str | None = None
    origin: str | None = None
    recurrence: Recurrence | None = None
    key_contact: str | None = None
    comments: str | None = None


class NewAction(BaseModel):
    title: str = Field(min_length=1)
    due_date: str | None = Field(None, pattern=DATE)
    owner: str | None = Field("Commercial IAT", description="Responsable")
    priority: Priority | None = None
    status: ActionStatus = "À faire"
    account: str | None = Field(None, description="Compte concerné, par son nom")
    related_to: str | None = Field(None, description="Sujet lié (compte, solution…) ; le nom du compte par défaut")
    comments: str | None = None


class ActionChanges(BaseModel):
    number: int = Field(description="Numéro de l'action")
    title: str | None = Field(None, min_length=1)
    status: ActionStatus | None = Field(None, description="« Fait » pour la cocher")
    due_date: str | None = Field(None, pattern=DATE)
    owner: str | None = None
    priority: Priority | None = None
    account: str | None = None
    related_to: str | None = None
    comments: str | None = None


class RenewalChanges(BaseModel):
    id: int = Field(description="Identifiant du contrat (list_renewals)")
    status: RenewalStatus | None = None
    last_reminder_date: str | None = Field(None, pattern=DATE, description="Date de la dernière relance")
    next_action: str | None = None
    owner: str | None = None
    last_invoice_date: str | None = Field(
        None, pattern=DATE, description="Après renouvellement : nouvelle date de facturation"
    )
    last_amount: Amount | None = None
    history: str | None = None
    due_date_override: str | None = Field(
        None, pattern=DATE, description="Seulement si l'échéance n'est pas facturation + 12 mois"
    )
    comments: str | None = None


class NewAccount(BaseModel):
    name: str = Field(min_length=1)
    kind: Literal["client", "prospect", "tender", "partner"] = "prospect"
    sector: str | None = None
    iat_lead: str | None = None
    notes: str | None = None


class AccountChanges(BaseModel):
    kind: Literal["client", "prospect", "tender", "partner"] | None = None
    display_name: str | None = None
    sector: str | None = None
    health: Literal["Bon", "À surveiller", "À risque"] | None = None
    satisfaction: int | None = Field(None, ge=1, le=5)
    iat_lead: str | None = Field(None, description="Responsable IAT (lead commercial)")
    executive_sponsor: str | None = Field(None, description="Relation haut niveau gérée par")
    leadership_summary: str | None = Field(None, description="Direction générale (DG, DGA…)")
    contact_direction: str | None = None
    contact_operational: str | None = None
    contact_purchasing: str | None = None
    last_contact: str | None = Field(None, pattern=DATE)
    next_meeting: str | None = None
    billing_details: str | None = Field(None, description="Coordonnées de facturation : raison sociale, NCC, e-mail")
    notes: str | None = None


class NewContact(BaseModel):
    name: str = Field(min_length=1)
    role: str | None = Field(None, description="Fonction")
    company: str | None = None
    account: str | None = Field(None, description="Compte du pipeline auquel le rattacher")
    phone: str | None = None
    email: str | None = None
    profile: str | None = None
    status: ContactStatus | None = "À contacter"
    comments: str | None = None


class ContactChanges(BaseModel):
    id: int
    name: str | None = Field(None, min_length=1)
    role: str | None = None
    company: str | None = None
    account: str | None = None
    phone: str | None = None
    email: str | None = None
    profile: str | None = None
    status: ContactStatus | None = None
    last_contact: str | None = Field(None, pattern=DATE)
    comments: str | None = None


class NewInvoice(BaseModel):
    account: str
    product: str = Field(min_length=1, description="Produit / service facturé")
    invoice_number: str | None = Field(None, description="N° de facture (FNE)")
    fiscal_year: int | None = None
    invoice_date: str | None = Field(None, pattern=DATE)
    amount: Amount | None = None
    collected: Amount | None = Field(None, description="Déjà encaissé")
    cost_of_sales: Amount | None = None
    commission: Amount | None = None
    vendor: str | None = Field(None, description="Partenaire / éditeur")
    recurrence: Recurrence | None = None
    comments: str | None = None


class InvoiceChanges(BaseModel):
    id: int = Field(description="Identifiant de la facture (get_account)")
    invoice_number: str | None = Field(None, description="N° de facture (FNE)")
    invoice_date: str | None = Field(None, pattern=DATE)
    amount: Amount | None = None
    collected: Amount | None = Field(None, description="Total encaissé à ce jour (et non le dernier versement)")
    cost_of_sales: Amount | None = None
    commission: Amount | None = None
    comments: str | None = None


class NewOpportunity(BaseModel):
    account: str
    title: str = Field(min_length=1)
    solution: str | None = None
    priority: Priority | None = None
    due_date: str | None = Field(None, pattern=DATE)
    owner: str | None = "Commercial IAT"
    action: str | None = Field(None, description="Valeur pour le client / action à mener")


class NewProspect(BaseModel):
    solution: str = Field(description="Nom de la solution, ex. Credolab")
    company: str = Field(min_length=1)
    sector: str | None = None
    contact: str | None = None
    angle: str | None = Field(None, description="Angle d'attaque / besoin")
    stage: StageCode | None = "M0"
    attack_week: str | None = Field(None, pattern=DATE, description="Lundi de la semaine d'attaque")
    next_action: str | None = None
    owner: str | None = None
    relationship_score: int | None = Field(None, ge=0, le=5)


class ProspectChanges(BaseModel):
    id: int = Field(description="Identifiant du prospect (get_solution)")
    stage: StageCode | None = None
    contact: str | None = None
    angle: str | None = None
    attack_week: str | None = Field(None, pattern=DATE)
    next_action: str | None = None
    owner: str | None = None
    relationship_score: int | None = Field(None, ge=0, le=5)
    last_action_date: str | None = Field(None, pattern=DATE)
    comments: str | None = None


# ---------- Aides ----------


def _given(model: BaseModel, *exclude: str) -> dict[str, Any]:
    """Les seuls champs fournis par Claude (un `null` explicite efface la valeur)."""
    return model.model_dump(exclude_unset=True, exclude=set(exclude))


def _created(model: BaseModel, *exclude: str) -> dict[str, Any]:
    return model.model_dump(exclude_none=True, exclude=set(exclude))


async def _batch(api: PipelineAPI, method: Literal["post", "patch"], path: str, items: list[dict]) -> list[dict]:
    if not items:
        raise PipelineAPIError("Aucun élément à traiter.")
    if len(items) > MAX_BATCH:
        raise PipelineAPIError(f"{MAX_BATCH} éléments au plus par appel ; découpez la demande.")
    body = await getattr(api, method)(f"/{path}/batch", {"items": items})
    return body["results"]


def register_write_tools(mcp: FastMCP, deps: Deps) -> None:
    settings = deps.settings

    # ---------- Affaires ----------

    @mcp.tool(annotations=WRITE)
    async def create_deals(deals: Annotated[list[NewDeal], Field(min_length=1, max_length=MAX_BATCH)]) -> dict:
        """Ajouter des affaires au pipeline (100 au plus, tout ou rien). Le numéro est attribué automatiquement."""
        async with deps.api() as api:
            resolver = Resolver(api)
            items = []
            for deal in deals:
                account = await resolver.account(deal.account)
                items.append(
                    {**_created(deal, "account"), "account_id": account["id"], "project_label": account["name"]}
                )
            results = await _batch(api, "post", "deals", items)
        return {"created": [formatting.deal(settings, d) for d in results]}

    @mcp.tool(annotations=UPDATE)
    async def update_deals(changes: Annotated[list[DealChanges], Field(min_length=1, max_length=MAX_BATCH)]) -> dict:
        """Modifier des affaires par leur numéro : étape, closing, montant, prochaine étape, échéance…
        Seuls les champs donnés changent ; `null` efface une valeur."""
        async with deps.api() as api:
            resolver = Resolver(api)
            items = []
            for change in changes:
                item = {"id": (await resolver.deal(change.number))["id"], **_given(change, "number", "account")}
                if "account" in change.model_fields_set and change.account:
                    item["account_id"] = await resolver.account_id(change.account)
                items.append(item)
            results = await _batch(api, "patch", "deals", items)
        return {"updated": [formatting.deal(settings, d) for d in results]}

    @mcp.tool(annotations=DELETE)
    async def delete_deal(number: Annotated[int, Field(description="Numéro de l'affaire")]) -> dict:
        """Supprimer définitivement une affaire. Demandez d'abord confirmation à l'utilisateur ;
        pour une affaire perdue ou arrêtée, préférez update_deals avec l'étape LOST ou CLOSED."""
        async with deps.api() as api:
            found = await Resolver(api).deal(number)
            await api.delete(f"/deals/{found['id']}")
        return {"deleted": f"Affaire n° {number} : {found['title']}"}

    # ---------- Plan d'actions ----------

    @mcp.tool(annotations=WRITE)
    async def create_actions(actions: Annotated[list[NewAction], Field(min_length=1, max_length=MAX_BATCH)]) -> dict:
        """Ajouter des actions au plan d'actions (100 au plus, tout ou rien), par exemple une par décision
        d'un compte rendu de réunion. Le numéro est attribué automatiquement."""
        async with deps.api() as api:
            resolver = Resolver(api)
            items = []
            for action in actions:
                item = _created(action, "account")
                if action.account:
                    account = await resolver.account(action.account)
                    item["account_id"] = account["id"]
                    item.setdefault("related_to", account["name"])
                items.append(item)
            results = await _batch(api, "post", "actions", items)
        return {"created": [formatting.action(settings, a) for a in results]}

    @mcp.tool(annotations=UPDATE)
    async def update_actions(
        changes: Annotated[list[ActionChanges], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """Modifier des actions par leur numéro ; status « Fait » pour les cocher. Seuls les champs donnés changent."""
        async with deps.api() as api:
            resolver = Resolver(api)
            items = []
            for change in changes:
                item = {"id": (await resolver.action(change.number))["id"], **_given(change, "number", "account")}
                if "account" in change.model_fields_set:
                    item["account_id"] = await resolver.account_id(change.account)
                items.append(item)
            results = await _batch(api, "patch", "actions", items)
        return {"updated": [formatting.action(settings, a) for a in results]}

    @mcp.tool(annotations=DELETE)
    async def delete_action(number: Annotated[int, Field(description="Numéro de l'action")]) -> dict:
        """Supprimer définitivement une action. Demandez d'abord confirmation ; pour une action devenue sans objet,
        préférez update_actions avec le statut « Abandonné »."""
        async with deps.api() as api:
            found = await Resolver(api).action(number)
            await api.delete(f"/actions/{found['id']}")
        return {"deleted": f"Action n° {number} : {found['title']}"}

    # ---------- Renouvellements ----------

    @mcp.tool(annotations=UPDATE)
    async def update_renewals(
        changes: Annotated[list[RenewalChanges], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """Suivre les renouvellements : statut, date de dernière relance, prochaine action. Une fois le contrat renouvelé
        et facturé, renseigner la nouvelle date de facturation et le montant : l'échéance suivante est recalculée."""
        async with deps.api() as api:
            results = await _batch(api, "patch", "renewals", [_given(change) for change in changes])
        return {"updated": [formatting.renewal(settings, r) for r in results]}

    # ---------- Comptes ----------

    @mcp.tool(annotations=WRITE)
    async def create_accounts(accounts: Annotated[list[NewAccount], Field(min_length=1, max_length=MAX_BATCH)]) -> dict:
        """Créer des comptes (nouveaux clients, prospects, partenaires), avant d'y rattacher des affaires."""
        async with deps.api() as api:
            results = await _batch(api, "post", "accounts", [_created(a) for a in accounts])
        return {"created": [formatting.account(settings, a) for a in results]}

    @mcp.tool(annotations=UPDATE)
    async def update_account(
        account: Annotated[str, Field(description="Nom du compte")], changes: AccountChanges
    ) -> dict:
        """Mettre à jour la fiche d'un compte : état de santé, satisfaction, interlocuteurs, dernier contact, notes…"""
        async with deps.api() as api:
            found = await Resolver(api).account(account)
            result = await api.patch(f"/accounts/{found['id']}", _given(changes))
        return {"updated": formatting.account(settings, result)}

    @mcp.tool(annotations=WRITE)
    async def create_opportunities(
        opportunities: Annotated[list[NewOpportunity], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """Noter des pistes de développement d'un compte (vente croisée, extension, renouvellement)."""
        async with deps.api() as api:
            resolver = Resolver(api)
            items = [
                {**_created(o, "account"), "account_id": await resolver.account_id(o.account)} for o in opportunities
            ]
            results = await _batch(api, "post", "opportunities", items)
        return {"created": [formatting.opportunity(o) for o in results]}

    # ---------- Contacts ----------

    @mcp.tool(annotations=WRITE)
    async def create_contacts(contacts: Annotated[list[NewContact], Field(min_length=1, max_length=MAX_BATCH)]) -> dict:
        """Ajouter des contacts, rattachés si possible à un compte du pipeline."""
        async with deps.api() as api:
            resolver = Resolver(api)
            items = []
            for contact in contacts:
                item = {**_created(contact, "account"), "source": "manual"}
                if contact.account:
                    account = await resolver.account(contact.account)
                    item["account_id"] = account["id"]
                    item.setdefault("company", account["name"])
                items.append(item)
            results = await _batch(api, "post", "contacts", items)
        return {"created": [formatting.contact(settings, c) for c in results]}

    @mcp.tool(annotations=UPDATE)
    async def update_contacts(
        changes: Annotated[list[ContactChanges], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """Modifier des contacts par leur identifiant : coordonnées, statut (« RDV obtenu »…), dernier contact."""
        async with deps.api() as api:
            resolver = Resolver(api)
            items = []
            for change in changes:
                item = _given(change, "account")
                if "account" in change.model_fields_set:
                    item["account_id"] = await resolver.account_id(change.account)
                items.append(item)
            results = await _batch(api, "patch", "contacts", items)
        return {"updated": [formatting.contact(settings, c) for c in results]}

    # ---------- Facturation ----------

    @mcp.tool(annotations=WRITE)
    async def create_invoices(invoices: Annotated[list[NewInvoice], Field(min_length=1, max_length=MAX_BATCH)]) -> dict:
        """Enregistrer des factures émises (point comptable) sur les comptes clients."""
        async with deps.api() as api:
            resolver = Resolver(api)
            items = [{**_created(i, "account"), "account_id": await resolver.account_id(i.account)} for i in invoices]
            results = await _batch(api, "post", "invoices", items)
        return {"created": [formatting.invoice(i) for i in results]}

    @mcp.tool(annotations=UPDATE)
    async def update_invoices(
        changes: Annotated[list[InvoiceChanges], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """Mettre à jour des factures, en particulier le montant encaissé (total à date) ; le solde est recalculé."""
        async with deps.api() as api:
            results = await _batch(api, "patch", "invoices", [_given(change) for change in changes])
        return {"updated": [formatting.invoice(i) for i in results]}

    # ---------- Prospects ----------

    @mcp.tool(annotations=WRITE)
    async def create_prospects(
        prospects: Annotated[list[NewProspect], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """Ajouter des prospects à une solution du catalogue (ex. une banque ciblée pour Credolab)."""
        async with deps.api() as api:
            resolver = Resolver(api)
            items = [
                {**_created(p, "solution"), "solution_id": (await resolver.solution(p.solution))["id"]}
                for p in prospects
            ]
            results = await _batch(api, "post", "prospects", items)
        return {"created": [formatting.prospect(p) for p in results]}

    @mcp.tool(annotations=UPDATE)
    async def update_prospects(
        changes: Annotated[list[ProspectChanges], Field(min_length=1, max_length=MAX_BATCH)],
    ) -> dict:
        """Faire avancer des prospects par leur identifiant : étape, contact, prochaine action, relation."""
        async with deps.api() as api:
            results = await _batch(api, "patch", "prospects", [_given(change) for change in changes])
        return {"updated": [formatting.prospect(p) for p in results]}
