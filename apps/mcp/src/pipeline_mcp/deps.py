"""Ce dont les outils ont besoin, injectable dans les tests : réglages et transport réseau."""

from dataclasses import dataclass

import httpx

from .api import PipelineAPI
from .auth import current_token
from .config import Settings


@dataclass
class Deps:
    settings: Settings
    transport: httpx.AsyncBaseTransport | None = None

    def api(self) -> PipelineAPI:
        """Un client de l'API authentifié comme la personne qui appelle l'outil."""
        return PipelineAPI(self.settings, current_token(self.settings), self.transport)
