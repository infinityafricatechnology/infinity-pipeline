# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl==3.1.5"]
# ///
"""Convertit le classeur « PIPELINE IAP.xlsx » (Infinity Africa Properties) en données de départ (JSON).

Usage : uv run tools/import/import_iap_xlsx.py "docs/iap/PIPELINE IAP.xlsx" data/seed-iap.json

- Les lignes de groupe (« ▸ Koumba Assanvo »), de sous-total et de total sont ignorées.
- Les dates saisies en texte (« dec-26 ») deviennent le 1er du mois (2026-12-01).
- Statut « mandat signé » → étape P1, « paiement effectué » → P5 (conclu), vide → P0 (mandat à signer).
- L'apporteur du classeur est aussi le closeur par défaut (part unique de 15 %) ; modifiable ensuite.
- Un taux de commission nul (construction : « commission pas encore définie ») est laissé vide.
- « Prochaine étape » devient une action du plan d'actions IAP, rattachée à l'affaire.
- La commission du classeur n'est pas reprise : l'application la recalcule (montant × taux).
"""

import json
import re
import sys
import warnings
from datetime import date, datetime

import openpyxl

warnings.filterwarnings("ignore", category=UserWarning)

MONTHS = {
    "jan": 1, "janv": 1, "fev": 2, "feb": 2, "mar": 3, "mars": 3, "avr": 4, "apr": 4, "mai": 5, "may": 5,
    "jun": 6, "juin": 6, "jul": 7, "juil": 7, "aou": 8, "aug": 8, "sep": 9, "sept": 9, "oct": 10,
    "nov": 11, "dec": 12,
}

STATUS_STAGES = {"mandat signé": "P1", "mandat signe": "P1", "paiement effectué": "P5", "paiement effectue": "P5"}

NATURES = {
    "vente bien immobilier": "Vente bien immobilier",
    "villa en vente": "Vente bien immobilier",
    "vente de terrain": "Vente de terrain",
    "mandat de recherche": "Mandat de recherche",
    "mandat de gestion": "Mandat de gestion",
    "location": "Location",
    "appart. à louer": "Location",
    "construction": "Construction",
}


def text(value):
    if value is None:
        return None
    value = re.sub(r"\s+", " ", str(value)).strip()
    return value or None


def to_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raw = text(value)
    if not raw:
        return None
    match = re.fullmatch(r"([a-zéû]+)\.?[-/ ](\d{2,4})", raw.lower())
    if match:
        key = match.group(1).replace("é", "e").replace("û", "u")
        month = MONTHS.get(key) or MONTHS.get(key[:3])
        if month:
            year = int(match.group(2))
            return date(year + 2000 if year < 100 else year, month, 1).isoformat()
    try:
        return datetime.fromisoformat(raw).date().isoformat()
    except ValueError:
        print(f"Date ignorée (format inconnu) : {raw!r}", file=sys.stderr)
        return None


def nature(value):
    raw = text(value)
    if not raw:
        return None
    return NATURES.get(raw.lower(), raw[0].upper() + raw[1:])


def number(value):
    if value is None or value == "":
        return None
    return float(value)


def main(source: str, target: str):
    ws = openpyxl.load_workbook(source, data_only=True).worksheets[0]
    header_row = next(
        r for r in ws.iter_rows(min_row=1, max_row=20) if any(text(c.value) == "Entreprise / Projet" for c in r)
    )
    columns = {text(c.value): c.column - 1 for c in header_row if text(c.value)}

    def cell(row, name):
        return row[columns[name]]

    deals, actions = [], []
    for row in ws.iter_rows(min_row=header_row[0].row + 1, values_only=True):
        n = cell(row, "N°")
        title = text(cell(row, "Entreprise / Projet"))
        if not isinstance(n, (int, float)) or not title:
            continue  # groupe, sous-total, total ou ligne vide
        person = text(cell(row, "Apporteur"))
        rate = number(cell(row, "% Commission"))
        status = (text(cell(row, "Statut")) or "").lower()
        deal = {
            "number": int(n),
            "title": title,
            "nature": nature(cell(row, "Nature")),
            "apporteur": person,
            "closeur": person,
            "stage": STATUS_STAGES.get(status, "P0"),
            "closing": number(cell(row, "Closing")),
            "amount": int(round(number(cell(row, "Montant (FCFA)")) or 0)) or None,
            "commission_rate": rate if rate else None,
            "due_date": to_date(cell(row, "Date de closing estimé")),
            "comments": text(cell(row, "Commentaires")),
            "next_step": text(cell(row, "Prochaine étape")),
        }
        if deal["stage"] == "P5":
            # Affaire conclue et payée : la commission du classeur est celle perçue par IAP.
            commission = number(cell(row, "Commission (FCFA)"))
            deal["commission_received"] = int(round(commission)) if commission else None
        if deal["commission_rate"] is not None and deal["commission_rate"] > 1:
            deal["commission_rate"] = None
        deals.append(deal)
        if deal["next_step"]:
            actions.append({
                "number": len(actions) + 1,
                "title": deal["next_step"],
                "deal": deal["number"],
                "owner": person,
                "due_date": deal["due_date"],
                "status": "À faire",
            })

    with open(target, "w", encoding="utf-8") as f:
        json.dump({"deals": deals, "actions": actions, "contacts": []}, f, ensure_ascii=False, indent=1)
    total = sum(d["amount"] or 0 for d in deals)
    amount = f"{total:,}".replace(",", " ")
    print(f"{len(deals)} affaires IAP ({amount} FCFA), {len(actions)} actions → {target}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
