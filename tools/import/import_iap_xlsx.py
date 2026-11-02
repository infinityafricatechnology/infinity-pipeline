# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl==3.1.5"]
# ///
"""Convertit le classeur du pipeline IAP (Infinity Africa Properties) en données de départ (JSON).

Usage : uv run tools/import/import_iap_xlsx.py docs/iap/PIPELINE_IAP_2.xlsx data/seed-iap.json

- Les colonnes sont repérées par leur en-tête : l'ancien format (PIPELINE IAP.xlsx) reste lisible.
- Les lignes de groupe (« ▸ Koumba Assanvo »), de sous-total et de total sont ignorées.
- Les dates saisies en texte (« dec-26 ») deviennent le 1er du mois (2026-12-01).
- Le statut du classeur est gardé tel quel (status_label) et donne l'étape : affaire à 100 % ou « paiement
  effectué » → P5 (conclu) ; « Signé » / « mandat signé » → P1 ; « Commercialisation active » → P2
  (présenté / visites) ; tout autre statut, ou aucun → P0 (mandat à signer).
- Priorité et facilité de commercialisation sont reprises ; l'onglet « Due diligence & Actions », relié par
  le titre, donne l'état de la due diligence et de l'étude du marché, et l'action à implémenter.
- L'apporteur du classeur est aussi le closeur par défaut (part unique de 15 %) ; modifiable ensuite.
- Un taux de commission nul (construction : « commission pas encore définie ») est laissé vide.
- « Prochaine étape » (à défaut l'action à implémenter) devient une action du plan d'actions IAP.
- La commission du classeur n'est pas reprise : l'application la recalcule (montant × taux).
- `version` (SEED_VERSION) : à augmenter quand un classeur assaini doit remplacer les données IAP déjà
  chargées en production (voir syncIapSeed dans apps/api/src/cli/seed.ts).
"""

import json
import re
import sys
import unicodedata
import warnings
from datetime import date, datetime

import openpyxl

warnings.filterwarnings("ignore", category=UserWarning)

MONTHS = {
    "jan": 1, "janv": 1, "fev": 2, "feb": 2, "mar": 3, "mars": 3, "avr": 4, "apr": 4, "mai": 5, "may": 5,
    "jun": 6, "juin": 6, "jul": 7, "juil": 7, "aou": 8, "aug": 8, "sep": 9, "sept": 9, "oct": 10,
    "nov": 11, "dec": 12,
}

SEED_VERSION = 2

STATUS_STAGES = {
    "signe": "P1",
    "mandat signe": "P1",
    "commercialisation active": "P2",
    "paiement effectue": "P5",
}
EASES = {"elevee": "Élevée", "moyenne": "Moyenne", "faible": "Faible"}
REVIEW_STATES = {"necessaire": "Nécessaire", "en cours": "En cours", "fait": "Fait", "n/a": "N/A", "a definir": "À définir"}

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


def fold(value):
    """Clé de comparaison : minuscules, sans accents ni espaces superflus."""
    raw = unicodedata.normalize("NFD", text(value) or "")
    return "".join(c for c in raw if unicodedata.category(c) != "Mn").lower()


def capitalized(value):
    raw = text(value)
    return raw[0].upper() + raw[1:] if raw else None


def review(value):
    """« Nécessaire — vérification des documents » → (« Nécessaire », « vérification des documents »)."""
    raw = text(value)
    if not raw:
        return None, None
    head, _, detail = raw.partition(" — ")
    state = REVIEW_STATES.get(fold(head))
    if state:
        return state, (detail.strip() or None)
    # Texte libre (« Conventions en cours d'analyse ») : état reconnu dans la phrase, texte gardé en détail.
    state = next((v for k, v in REVIEW_STATES.items() if re.search(rf"\b{re.escape(k)}\b", fold(raw))), None)
    return (state, raw) if state else (raw, None)


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


def diligence_sheet(wb):
    """Onglet « Due diligence & Actions » : lignes par titre de projet (clé repliée), dans l'ordre du classeur.

    Plusieurs affaires peuvent porter le même titre (programme Silver) : elles sont appariées dans l'ordre.
    """
    ws = next((w for w in wb.worksheets if fold(w.title).startswith("due diligence")), None)
    if ws is None:
        return {}
    rows = ws.iter_rows(values_only=True)
    header = next((r for r in rows if any(text(v) == "Entreprise / Projet" for v in r)), None)
    if header is None:
        return {}
    columns = {text(v): i for i, v in enumerate(header) if text(v)}
    info = {}
    for row in rows:
        title = text(row[columns["Entreprise / Projet"]])
        if not title:
            continue
        info.setdefault(fold(title), []).append({
            "due_diligence": review(row[columns["Due diligence"]]),
            "market_study": review(row[columns["Étude du marché"]]),
            "action": text(row[columns["Action à implémenter"]]),
        })
    return info


def stage_of(status, closing):
    if closing is not None and closing >= 1:
        return "P5"
    return STATUS_STAGES.get(fold(status), "P0")


def main(source: str, target: str):
    wb = openpyxl.load_workbook(source, data_only=True)
    ws = wb.worksheets[0]
    header_row = next(
        r for r in ws.iter_rows(min_row=1, max_row=20) if any(text(c.value) == "Entreprise / Projet" for c in r)
    )
    columns = {text(c.value): c.column - 1 for c in header_row if text(c.value)}
    diligence = diligence_sheet(wb)

    def cell(row, name):
        return row[columns[name]] if name in columns else None

    deals, actions = [], []
    for row in ws.iter_rows(min_row=header_row[0].row + 1, values_only=True):
        n = cell(row, "N°")
        title = text(cell(row, "Entreprise / Projet"))
        if not isinstance(n, (int, float)) or not title:
            continue  # groupe, sous-total, total ou ligne vide
        person = text(cell(row, "Apporteur"))
        rate = number(cell(row, "% Commission"))
        closing = number(cell(row, "Closing"))
        status = capitalized(cell(row, "Statut"))
        priority = number(cell(row, "Priorité"))
        same_title = diligence.get(fold(title)) or [{}]
        extra = same_title.pop(0) if len(same_title) > 1 else same_title[0]
        comments = text(cell(row, "Commentaires"))
        deal = {
            "number": int(n),
            "priority": int(priority) if priority else None,
            "title": title,
            "nature": nature(cell(row, "Nature")),
            "ease": EASES.get(fold(cell(row, "Facilité de commercialisation"))),
            "apporteur": person,
            "closeur": person,
            "status_label": status,
            "stage": stage_of(status, closing),
            "closing": closing,
            "amount": int(round(number(cell(row, "Montant (FCFA)")) or 0)) or None,
            "commission_rate": rate if rate else None,
            "due_date": to_date(cell(row, "Date de closing estimé")),
            "comments": comments,
            "next_step": text(cell(row, "Prochaine étape")),
        }
        for field in ("due_diligence", "market_study"):
            state, detail = extra.get(field, (None, None))
            deal[field] = state
            label = "Due diligence" if field == "due_diligence" else "Étude du marché"
            if detail and state != "N/A" and fold(detail) not in fold(deal["comments"]):
                deal["comments"] = "\n".join(filter(None, [deal["comments"], f"{label} : {detail}."]))
        if deal["stage"] == "P5":
            # Affaire conclue et payée : la commission du classeur est celle perçue par IAP.
            commission = number(cell(row, "Commission (FCFA)"))
            deal["commission_received"] = int(round(commission)) if commission else None
        if deal["commission_rate"] is not None and deal["commission_rate"] > 1:
            deal["commission_rate"] = None
        deals.append(deal)
        action = deal["next_step"] or extra.get("action")
        if action and not fold(action).startswith("voir ligne") and deal["stage"] != "P5":
            actions.append({
                "number": len(actions) + 1,
                "title": action,
                "deal": deal["number"],
                "owner": person,
                "due_date": deal["due_date"],
                "status": "À faire",
            })

    with open(target, "w", encoding="utf-8") as f:
        json.dump(
            {"version": SEED_VERSION, "deals": deals, "actions": actions, "contacts": []},
            f, ensure_ascii=False, indent=1,
        )
    total = sum(d["amount"] or 0 for d in deals)
    amount = f"{total:,}".replace(",", " ")
    print(f"{len(deals)} affaires IAP ({amount} FCFA), {len(actions)} actions → {target}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
