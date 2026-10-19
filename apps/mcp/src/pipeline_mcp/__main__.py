"""Lance le serveur : `infinity-pipeline-mcp` (HTTP) ou `infinity-pipeline-mcp stdio`."""

import sys

from .config import Settings
from .deps import Deps
from .server import create_server


def main() -> None:
    transport = sys.argv[1] if len(sys.argv) > 1 else "http"
    if transport not in ("http", "stdio"):
        raise SystemExit("Usage : infinity-pipeline-mcp [http|stdio]")
    settings = Settings.from_env()
    if transport == "stdio":
        if not settings.api_token:
            raise SystemExit("PIPELINE_API_TOKEN est requis en stdio.")
        create_server(Deps(settings), authenticate=False).run(transport="stdio", show_banner=False)
    else:
        create_server(Deps(settings)).run(
            transport="http", host=settings.host, port=settings.port, path=settings.path, show_banner=False
        )


if __name__ == "__main__":
    main()
