"""Authentification Bearer : le jeton est un jeton Infinity Pipeline, vérifié auprès de l'API."""

import hashlib
import time

import httpx
from fastmcp.server.auth import AccessToken, TokenVerifier
from fastmcp.server.dependencies import get_access_token

from .api import PipelineAPI, PipelineAPIError
from .config import Settings

# Durée pendant laquelle un jeton vérifié est cru sans nouvelle vérification
CACHE_SECONDS = 60


class PipelineTokenVerifier(TokenVerifier):
    """Accepte les jetons que l'API accepte ; l'API applique ensuite les droits de la personne."""

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        super().__init__(base_url=settings.public_url)
        self.settings = settings
        self._transport = transport
        self._cache: dict[str, tuple[float, AccessToken]] = {}

    async def verify_token(self, token: str) -> AccessToken | None:
        key = hashlib.sha256(token.encode()).hexdigest()
        cached = self._cache.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        try:
            async with PipelineAPI(self.settings, token, self._transport) as api:
                me = await api.me()
        except PipelineAPIError:
            self._cache.pop(key, None)
            return None
        access_token = AccessToken(token=token, client_id=str(me["user"]["id"]), scopes=[], claims={"user": me["user"]})
        self._cache[key] = (time.monotonic() + CACHE_SECONDS, access_token)
        return access_token


def current_token(settings: Settings) -> str:
    """Le jeton de l'appelant en HTTP, ou celui de la configuration pour un serveur mono-utilisateur (stdio)."""
    access_token = get_access_token()
    if access_token is not None:
        return access_token.token
    if settings.api_token:
        return settings.api_token
    raise PipelineAPIError(
        "Aucun jeton Infinity Pipeline : envoyez « Authorization: Bearer <jeton> » ou définissez PIPELINE_API_TOKEN."
    )
