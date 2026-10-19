"""Formes compactes et lisibles de ce que renvoient les outils, avec un lien vers l'application."""

from typing import Any

from .config import Settings


def _keep(data: dict) -> dict:
    """Retire les valeurs vides pour garder les réponses courtes."""
    return {key: value for key, value in data.items() if value not in (None, "", [], {})}


def account(settings: Settings, a: dict) -> dict:
    return _keep(
        {
            "id": a["id"],
            "name": a["name"],
            "kind": a.get("kind"),
            "sector": a.get("sector"),
            "health": a.get("health"),
            "deals_count": a.get("deals_count"),
            "open_amount": a.get("open_amount") or None,
            "url": f"{settings.web_url}/comptes/{a['slug']}",
        }
    )


def deal(settings: Settings, d: dict) -> dict:
    return _keep(
        {
            "number": d["number"],
            "title": d["title"],
            "account": d.get("account_name"),
            "project": d.get("project_label") if d.get("project_label") != d.get("account_name") else None,
            "stage": d.get("stage_label"),
            "priority": d.get("priority"),
            "amount": d.get("amount"),
            "closing": d.get("closing"),
            "weighted_amount": d.get("weighted_amount"),
            "commission": d.get("commission"),
            "due_date": d.get("due_date"),
            "overdue": d.get("overdue") or None,
            "next_step": d.get("next_step"),
            "lead": d.get("lead"),
            "url": f"{settings.web_url}/affaires?affaire={d['number']}",
        }
    )


def deal_full(settings: Settings, d: dict) -> dict:
    return {
        **deal(settings, d),
        **_keep(
            {
                "solution": d.get("solution"),
                "service": d.get("service"),
                "origin": d.get("origin"),
                "recurrence": d.get("recurrence"),
                "profitability": d.get("profitability"),
                "key_contact": d.get("key_contact"),
                "comments": d.get("comments"),
            }
        ),
    }


def action(settings: Settings, a: dict) -> dict:
    return _keep(
        {
            "number": a["number"],
            "title": a["title"],
            "status": a.get("status"),
            "priority": a.get("priority"),
            "due_date": a.get("due_date"),
            "overdue": a.get("overdue") or None,
            "owner": a.get("owner"),
            "related_to": a.get("related_to"),
            "account": a.get("account_name"),
            "comments": a.get("comments"),
            "url": f"{settings.web_url}/actions?action={a['number']}",
        }
    )


def renewal(settings: Settings, r: dict) -> dict:
    return _keep(
        {
            "id": r["id"],
            "account": r.get("account_name"),
            "contract": r["contract"],
            "alert": r.get("alert"),
            "status": r.get("status"),
            "due_date": r.get("due_date"),
            "days_left": r.get("days_left"),
            "reminder_90": r.get("reminder_90"),
            "reminder_30": r.get("reminder_30"),
            "last_invoice_date": r.get("last_invoice_date"),
            "last_amount": r.get("last_amount"),
            "last_reminder_date": r.get("last_reminder_date"),
            "next_action": r.get("next_action"),
            "owner": r.get("owner"),
            "url": f"{settings.web_url}/renouvellements?contrat={r['id']}",
        }
    )


def contact(settings: Settings, c: dict) -> dict:
    return _keep(
        {
            "id": c["id"],
            "name": c["name"],
            "role": c.get("role"),
            "company": c.get("company"),
            "account": c.get("account_name"),
            "phone": c.get("phone"),
            "email": c.get("email"),
            "profile": c.get("profile"),
            "status": c.get("status"),
            "last_contact": c.get("last_contact"),
            "url": f"{settings.web_url}/contacts?contact={c['id']}",
        }
    )


def invoice(i: dict) -> dict:
    return _keep(
        {
            "id": i["id"],
            "product": i["product"],
            "fiscal_year": i.get("fiscal_year"),
            "invoice_date": i.get("invoice_date"),
            "amount": i.get("amount"),
            "collected": i.get("collected"),
            "balance": i.get("balance"),
            "commission": i.get("commission"),
            "comments": i.get("comments"),
        }
    )


def opportunity(o: dict) -> dict:
    return _keep({key: o.get(key) for key in ("id", "title", "solution", "priority", "due_date", "owner", "action")})


def prospect(p: dict) -> dict:
    return _keep(
        {
            "id": p["id"],
            "company": p["company"],
            "solution": p.get("solution_name"),
            "sector": p.get("sector"),
            "stage": p.get("stage_label"),
            "attack_week": p.get("attack_week"),
            "relationship_score": p.get("relationship_score"),
            "contact": p.get("contact"),
            "angle": p.get("angle"),
            "next_action": p.get("next_action"),
        }
    )


def tender(t: dict) -> dict:
    return _keep(
        {
            key: t.get(key)
            for key in (
                "id",
                "organization",
                "subject",
                "stage",
                "deadline",
                "days_left",
                "estimated_amount",
                "partners",
                "owner",
                "comments",
            )
        }
    )


def activity(event: dict) -> dict:
    changes: Any = event.get("changes")
    fields = sorted(changes) if event.get("action") == "update" and isinstance(changes, dict) else None
    return _keep(
        {
            "at": event["at"],
            "who": event.get("user_name"),
            "via": event.get("via"),
            "action": event.get("action"),
            "entity": event.get("entity"),
            "label": event.get("label"),
            "fields": fields,
        }
    )
