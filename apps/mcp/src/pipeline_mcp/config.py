"""Réglages, lus dans l'environnement."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # API d'Infinity Pipeline, telle que ce serveur l'atteint (ex. http://app:8300 dans Docker)
    api_url: str
    # Application web, pour les liens donnés à Claude
    web_url: str
    # Jeton utilisé quand le client n'en envoie pas (stdio, une seule personne) ; en HTTP chacun envoie le sien
    api_token: str | None = None
    host: str = "127.0.0.1"
    port: int = 8311
    path: str = "/mcp"
    # Adresse publique de ce serveur, annoncée aux clients quand il est derrière un proxy
    public_url: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        if not os.environ.get("PIPELINE_API_URL"):
            raise RuntimeError("Variable d'environnement manquante : PIPELINE_API_URL")
        api_url = os.environ["PIPELINE_API_URL"].rstrip("/")
        return cls(
            api_url=api_url,
            web_url=os.environ.get("PIPELINE_WEB_URL", api_url).rstrip("/"),
            api_token=os.environ.get("PIPELINE_API_TOKEN") or None,
            host=os.environ.get("MCP_HOST", "127.0.0.1"),
            port=int(os.environ.get("MCP_PORT", "8311")),
            path=os.environ.get("MCP_PATH", "/mcp"),
            public_url=os.environ.get("MCP_PUBLIC_URL") or None,
        )
