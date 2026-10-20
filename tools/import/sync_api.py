# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx==0.28.1"]
# ///
"""Reporte dans une base déjà en service les compléments de facturation de data/seed.json.

Le seed ne s'applique qu'à une base vide : ce script passe par l'API publique, avec un jeton
(Réglages > Connecter Claude), et ne touche qu'à des champs vides ou restés à leur valeur d'origine :
- facture : n° de facture, détail ajouté à la fin des commentaires ;
- compte : coordonnées de facturation.

  PIPELINE_API_URL=https://… PIPELINE_API_TOKEN=… uv run tools/import/sync_api.py           # aperçu
  PIPELINE_API_URL=https://… PIPELINE_API_TOKEN=… uv run tools/import/sync_api.py --apply   # écrit
"""

import json
import os
import sys
from pathlib import Path

import httpx

SEED = Path(__file__).resolve().parents[2] / "data" / "seed.json"


def fetch_all(api: httpx.Client, path: str) -> list[dict]:
    items, offset = [], 0
    while True:
        page = api.get(f"/api/v1/{path}", params={"limit": 500, "offset": offset}).raise_for_status().json()
        items += page["results"]
        offset += len(page["results"])
        if offset >= page["total"] or not page["results"]:
            return items


def invoice_changes(seed: dict, invoices: list[dict]) -> list[dict]:
    changes = []
    for wanted in seed["invoices"]:
        if not wanted.get("invoice_number") and "\n\nFacture" not in (wanted.get("comments") or ""):
            continue
        match = [
            i
            for i in invoices
            if i["account_slug"] == wanted["account"] and i["invoice_date"] == wanted["invoice_date"] and i["amount"] == wanted["amount"]
        ]
        if len(match) != 1:
            print(f"! {wanted['account']} {wanted['invoice_date']} : {len(match)} facture(s) correspondante(s), ignorée")
            continue
        current, patch = match[0], {}
        if wanted.get("invoice_number") and not current.get("invoice_number"):
            patch["invoice_number"] = wanted["invoice_number"]
        detail = wanted["comments"].split("\n\nFacture", 1)[1]
        if "Facture" + detail not in (current.get("comments") or ""):
            # Les commentaires saisis depuis sont gardés : le détail s'ajoute à la fin.
            patch["comments"] = "\n\n".join(filter(None, [current.get("comments"), "Facture" + detail]))
        if patch:
            changes.append({"id": current["id"], "label": f"{current['account_name']} · {current['product']} {current['fiscal_year']}", **patch})
    return changes


def account_changes(seed: dict, accounts: list[dict]) -> list[dict]:
    by_slug = {a["slug"]: a for a in accounts}
    changes = []
    for wanted in seed["accounts"]:
        current = by_slug.get(wanted["key"])
        if wanted.get("billing_details") and current and not current.get("billing_details"):
            changes.append({"id": current["id"], "label": current["name"], "billing_details": wanted["billing_details"]})
    return changes


def main() -> None:
    apply = "--apply" in sys.argv
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    api = httpx.Client(
        base_url=os.environ["PIPELINE_API_URL"].rstrip("/"),
        headers={"Authorization": f"Bearer {os.environ['PIPELINE_API_TOKEN']}"},
        timeout=30,
    )
    plan = {
        "invoices": invoice_changes(seed, fetch_all(api, "invoices")),
        "accounts": account_changes(seed, fetch_all(api, "accounts")),
    }
    for path, changes in plan.items():
        for change in changes:
            fields = ", ".join(k for k in change if k not in ("id", "label"))
            print(f"{path:9} #{change['id']:<4} {change['label']} → {fields}")
    if not any(plan.values()):
        print("Rien à mettre à jour.")
        return
    if not apply:
        print("\nAperçu seulement : relancez avec --apply pour écrire.")
        return
    for path, changes in plan.items():
        if changes:
            items = [{k: v for k, v in c.items() if k != "label"} for c in changes]
            api.patch(f"/api/v1/{path}/batch", json={"items": items}).raise_for_status()
    print(f"\nMis à jour : {len(plan['invoices'])} facture(s), {len(plan['accounts'])} compte(s).")


if __name__ == "__main__":
    main()
