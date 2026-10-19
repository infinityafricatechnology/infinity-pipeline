"""Client de l'API publique d'Infinity Pipeline (/api/v1), authentifié avec le jeton de la personne."""

from typing import Any, Self

import httpx
from fastmcp.exceptions import ToolError

from .config import Settings

TIMEOUT = httpx.Timeout(20.0)


class PipelineAPIError(ToolError):
    """Une erreur de l'API, formulée pour la personne qui parle à Claude."""


def _error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:300]
    if isinstance(body, dict) and isinstance(body.get("error"), str):
        return body["error"]
    return str(body)[:300]


def _raise_for_status(response: httpx.Response) -> None:
    if response.is_success:
        return
    status = response.status_code
    if status == 401:
        message = (
            "Le jeton Infinity Pipeline est invalide ou expiré. "
            "Générez-en un nouveau dans Infinity Pipeline : Réglages > Connecter Claude."
        )
    elif status == 403:
        message = f"Accès refusé par Infinity Pipeline : {_error_detail(response)}"
    elif status == 429:
        message = "La limite de requêtes d'Infinity Pipeline est atteinte ; réessayez dans une minute."
    elif status >= 500:
        message = "Infinity Pipeline a rencontré une erreur interne ; réessayez plus tard."
    else:
        # 400, 404, 409 : l'API explique déjà en français ce qui ne va pas et les valeurs admises
        message = _error_detail(response)
    raise PipelineAPIError(message)


class PipelineAPI:
    """Une instance par appel d'outil ; ``transport`` permet aux tests de remplacer le réseau."""

    def __init__(self, settings: Settings, token: str, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self._client = httpx.AsyncClient(
            base_url=f"{settings.api_url}/api/v1",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=TIMEOUT,
            transport=transport,
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc_info) -> None:
        await self._client.aclose()

    async def request(self, method: str, path: str, *, params: dict | None = None, json: Any = None) -> Any:
        clean_params = {key: _param(value) for key, value in (params or {}).items() if value is not None}
        try:
            response = await self._client.request(method, path, params=clean_params, json=json)
        except httpx.HTTPError as error:
            raise PipelineAPIError(f"Infinity Pipeline est injoignable ({error.__class__.__name__}).") from error
        _raise_for_status(response)
        return response.json() if response.content else None

    async def get(self, path: str, **params: Any) -> Any:
        return await self.request("GET", path, params=params)

    async def post(self, path: str, body: Any) -> Any:
        return await self.request("POST", path, json=body)

    async def patch(self, path: str, body: Any) -> Any:
        return await self.request("PATCH", path, json=body)

    async def delete(self, path: str) -> None:
        await self.request("DELETE", path)

    async def me(self) -> dict:
        return await self.get("/me")


def _param(value: Any) -> Any:
    return str(value).lower() if isinstance(value, bool) else value
