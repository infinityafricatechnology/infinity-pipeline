# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl==3.1.5"]
# ///
"""Convertit le classeur du Groupe (onglets IAC, IAF et PARTENAIRES) en données de départ (JSON).

Usage : uv run tools/import/import_fin_xlsx.py docs/groupe/PIPELINE_GROUPE_IAC_IAF.xlsx data/seed-fin.json

- Les colonnes sont repérées par leur en-tête (« Montant de la demande » / « Montant De la Demande »…).
- Les lignes de titre, de total et les lignes sans entreprise sont ignorées.
- Les onglets IAP et IAT du classeur ne sont pas repris : l'application a ses propres classeurs, plus récents.
- Le classeur n'a pas d'étape : elle est déduite des commentaires et de la prochaine étape (voir STAGE_HINTS) ;
  sans indice, l'affaire est en F0 (prospection). Modifiable ensuite dans l'application.
- Dates IAF dont le jour vaut le numéro de ligne (recopie incrémentée dans Excel) : ramenées au 1er du mois.
- La commission n'est pas reprise : l'application la recalcule (montant × taux). Un taux vide reste vide.
- Un honoraire nul est laissé vide. L'encaissement de l'honoraire n'est pas déduit du texte des commentaires.
- « Prochaine étape » devient une action du plan d'actions de la filiale.
- `version` (SEED_VERSION) : à augmenter quand un classeur révisé doit remplacer les données IAC / IAF et les
  partenaires déjà chargés en production (voir syncFinSeed dans apps/api/src/cli/seed.ts).
"""

import json
import re
import sys
import unicodedata
import warnings
from datetime import date, datetime

import openpyxl

warnings.filterwarnings("ignore", category=UserWarning)

SEED_VERSION = 1

# Premier indice trouvé (dans l'ordre) dans « commentaires + prochaine étape », texte replié sans accents.
STAGE_HINTS = [
    ("F4", ["recouvr", "paiement attendu", "solde", "facturation"]),
    ("F3", ["structuration", "transmission du dossier"]),
    ("F1", ["faisabilite", "attente de document", "donnees manquantes", "proposition commerciale", "mandat", "attente du projet"]),
]

SECTORS = {"energie": "Énergie", "education": "Éducation"}
NATURES = {"a definir": "À définir"}
POTENTIALS = {"eleve": "Élevé", "moyen": "Moyen", "faible": "Faible"}
ENTITIES = {"groupe": "Groupe", "iat": "IAT", "iap": "IAP", "iac": "IAC", "iaf": "IAF"}


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


def number(value):
    if value is None or value == "" or isinstance(value, str):
        return None
    return float(value)


def amount(value):
    n = number(value)
    return int(round(n)) if n else None


def to_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return None


def header(ws, marker):
    """Ligne d'en-tête (celle qui contient `marker`) : nom de colonne replié → index."""
    for row in ws.iter_rows(min_row=1, max_row=20):
        if any(fold(c.value) == fold(marker) for c in row):
            return row[0].row, {fold(c.value): c.column - 1 for c in row if text(c.value)}
    raise SystemExit(f"Onglet {ws.title} : en-tête « {marker} » introuvable.")


def stage_of(comments, next_step):
    hay = fold(" ".join(filter(None, [comments, next_step])))
    for stage, hints in STAGE_HINTS:
        if any(h in hay for h in hints):
            return stage
    return "F0"


def deals_sheet(ws, space):
    start, columns = header(ws, "Entreprise / Projet")

    def cell(row, *names):
        for name in names:
            if fold(name) in columns:
                return row[columns[fold(name)]]
        return None

    deals, actions = [], []
    for row in ws.iter_rows(min_row=start + 1, values_only=True):
        n = cell(row, "N°")
        title = text(cell(row, "Entreprise / Projet"))
        if not isinstance(n, (int, float)) or not title or fold(title).startswith("total"):
            continue
        comments = capitalized(cell(row, "Commentaires"))
        next_step = capitalized(cell(row, "Prochaine étape"))
        due = cell(row, "Date de closing estimé")
        if isinstance(due, datetime) and due.day == int(n) and due.day != 1:
            due = due.replace(day=1)  # recopie incrémentée : seul le mois a un sens
        rate = number(cell(row, "% Commission", "% Commission de succès"))
        nature = text(cell(row, "Nature"))
        sector = text(cell(row, "Domaine"))
        deal = {
            "number": int(n),
            "title": title,
            "nature": NATURES.get(fold(nature), capitalized(nature)),
            "sector": SECTORS.get(fold(sector), sector),
            "stage": stage_of(comments, next_step),
            "closing": number(cell(row, "Closing")),
            "due_date": to_date(due),
            "amount": amount(cell(row, "Montant de la demande")),
            "fee": amount(cell(row, "Honoraire")),
            "commission_rate": rate if rate else None,
            "comments": comments,
            "next_step": next_step,
        }
        deals.append(deal)
        if next_step:
            actions.append({
                "number": len(actions) + 1,
                "title": next_step,
                "deal": deal["number"],
                "due_date": deal["due_date"],
                "status": "À faire",
            })
    return deals, actions


def partners_sheet(ws):
    start, columns = header(ws, "Partenaire")
    fields = {
        "entity": "Entité IAG",
        "name": "Partenaire",
        "type": "Type de partenaire",
        "zone": "Zone / Marché",
        "expertise": "Expertise / Offre partenaire",
        "complementarity": "Complémentarité avec IAG",
        "market_access": "Accès marché / Clients",
        "potential": "Potentiel commercial",
        "model": "Modèle de partenariat",
        "relationship": "Niveau de relation",
        "legal_status": "Statut juridique / NDA",
        "iag_referent": "Référent IAG",
        "partner_referent": "Référent partenaire",
        "opportunities": "Opportunités conjointes",
        "potential_revenue": "CA potentiel (FCFA)",
        "margin": "Marge / Commission IAG",
        "last_interaction": "Dernière interaction",
        "next_action": "Prochaine action",
        "due_date": "Échéance",
        "priority": "Priorité",
        "risks": "Risques / dépendances",
    }
    partners = []
    for row in ws.iter_rows(min_row=start + 1, values_only=True):
        get = lambda f: row[columns[fold(fields[f])]] if fold(fields[f]) in columns else None  # noqa: E731
        name = text(get("name"))
        if not name:
            continue
        p = {f: capitalized(get(f)) for f in fields}
        p["number"] = len(partners) + 1
        p["name"] = name
        p["entity"] = ENTITIES.get(fold(get("entity")), "Groupe")
        p["potential"] = POTENTIALS.get(fold(get("potential")))
        p["potential_revenue"] = amount(get("potential_revenue"))
        p["last_interaction"] = to_date(get("last_interaction"))
        p["due_date"] = to_date(get("due_date"))
        p["priority"] = text(get("priority")) if text(get("priority")) in ("P1", "P2", "P3") else None
        partners.append(p)
    return partners


def main(source: str, target: str):
    wb = openpyxl.load_workbook(source, data_only=True)
    sheets = {fold(ws.title): ws for ws in wb.worksheets}
    data = {"version": SEED_VERSION}
    for space in ("iac", "iaf"):
        deals, actions = deals_sheet(sheets[space], space)
        data[space] = {"deals": deals, "actions": actions, "contacts": []}
        total = f"{sum(d['amount'] or 0 for d in deals):,}".replace(",", " ")
        stages = {s: sum(d["stage"] == s for d in deals) for s in sorted({d["stage"] for d in deals})}
        print(f"{space.upper()} : {len(deals)} affaires ({total} FCFA), {len(actions)} actions, étapes {stages}")
    data["partners"] = partners_sheet(sheets["partenaires"])
    print(f"{len(data['partners'])} partenaires")
    with open(target, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"→ {target}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
