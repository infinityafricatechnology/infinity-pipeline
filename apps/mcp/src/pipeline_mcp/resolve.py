"""Des noms vers les identifiants : comptes, affaires, actions et solutions.

Claude désigne un compte par son nom (« CNPS », « Orange »), une affaire ou une action par son numéro.
Un nom inconnu ou ambigu échoue avant toute écriture, en citant les valeurs possibles.
"""

import unicodedata

from .api import PipelineAPI, PipelineAPIError


def norm(text: str | None) -> str:
    """Minuscules, sans accents ni espaces superflus."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", text)
    return " ".join("".join(c for c in decomposed if not unicodedata.combining(c)).lower().split())


class Resolver:
    """Résout les références d'un appel d'outil, en gardant ce qu'il a déjà lu."""

    def __init__(self, api: PipelineAPI):
        self.api = api
        self._accounts: dict[str, dict] = {}
        self._solutions: list[dict] | None = None

    async def account(self, reference: str | int) -> dict:
        key = norm(str(reference))
        if key in self._accounts:
            return self._accounts[key]
        if str(reference).isdigit():
            found = await self.api.get(f"/accounts/{reference}")
        else:
            matches = (await self.api.get("/accounts", q=str(reference), limit=50))["results"]
            exact = [a for a in matches if key in (norm(a["name"]), norm(a.get("display_name")), a["slug"])]
            if len(exact) == 1:
                found = exact[0]
            elif len(matches) == 1:
                found = matches[0]
            elif matches:
                names = ", ".join(a["name"] for a in matches[:15])
                raise PipelineAPIError(f"Plusieurs comptes correspondent à « {reference} » : {names}. Précisez lequel.")
            else:
                known = (await self.api.get("/accounts", limit=500))["results"]
                # « Sodeci SA », « la CNPS » : le nom d'un compte contenu dans la référence
                within = [a for a in known if f" {norm(a['name'])} " in f" {key} "]
                if len(within) == 1:
                    self._accounts[key] = within[0]
                    return within[0]
                names = ", ".join(a["name"] for a in known[:40])
                raise PipelineAPIError(
                    f"Aucun compte « {reference} ». Comptes existants : {names}. "
                    "Créez le compte avec create_accounts s'il s'agit d'un nouveau client ou prospect."
                )
        self._accounts[key] = found
        return found

    async def account_id(self, reference: str | int | None) -> int | None:
        return None if reference is None else (await self.account(reference))["id"]

    async def deal(self, number: int) -> dict:
        results = (await self.api.get("/deals", number=number))["results"]
        if not results:
            raise PipelineAPIError(f"Aucune affaire n° {number}. Utilisez search_deals pour retrouver son numéro.")
        return results[0]

    async def action(self, number: int) -> dict:
        results = (await self.api.get("/actions", number=number))["results"]
        if not results:
            raise PipelineAPIError(f"Aucune action n° {number}. Utilisez search_actions pour retrouver son numéro.")
        return results[0]

    async def solution(self, reference: str) -> dict:
        if self._solutions is None:
            self._solutions = (await self.api.get("/solutions", limit=200))["results"]
        key = norm(reference)
        exact = [s for s in self._solutions if norm(s["name"]) == key]
        partial = [s for s in self._solutions if key and key in norm(s["name"])]
        found = exact or partial
        if len(found) == 1:
            return found[0]
        names = ", ".join(s["name"] for s in (found or self._solutions))
        if found:
            raise PipelineAPIError(f"Plusieurs solutions correspondent à « {reference} » : {names}.")
        raise PipelineAPIError(f"Aucune solution « {reference} ». Solutions du catalogue : {names}.")
