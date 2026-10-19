"""Un serveur en mémoire qui parle à une API Infinity Pipeline simulée."""

import pytest
import respx
from fastmcp import Client

from pipeline_mcp.config import Settings
from pipeline_mcp.deps import Deps
from pipeline_mcp.server import create_server

API = "http://api.test/api/v1"
SETTINGS = Settings(api_url="http://api.test", web_url="https://pipeline.test", api_token="iat_tok")

ME = {"user": {"id": 1, "email": "awa@iat.ci", "name": "Awa", "role": "member"}, "via": "claude", "today": "2026-10-19"}
CNPS = {
    "id": 2,
    "slug": "cnps",
    "name": "CNPS",
    "display_name": None,
    "kind": "client",
    "deals_count": 2,
    "open_amount": 81700000,
}
CNAM = {
    "id": 1,
    "slug": "cnam",
    "name": "CNAM",
    "display_name": None,
    "kind": "client",
    "deals_count": 3,
    "open_amount": 0,
}


def page(results):
    return {"results": results, "total": len(results), "limit": 100, "offset": 0}


def deal(number, title, *, account=CNPS, stage="M5", amount=22700000, closing=None):
    return {
        "id": number,
        "number": number,
        "title": title,
        "account_id": account["id"],
        "account_name": account["name"],
        "project_label": account["name"],
        "stage": stage,
        "stage_label": {"M5": "M5 – Négociation / signature", "M6": "M6 – Gagné"}.get(stage, stage),
        "amount": amount,
        "closing": closing,
        "weighted_amount": round(amount * closing) if closing is not None else None,
        "priority": "P1",
        "due_date": "2026-10-23",
        "overdue": False,
    }


@pytest.fixture
def api():
    with respx.mock(assert_all_called=False) as router:
        router.get(f"{API}/me").respond(json=ME)
        router.get(f"{API}/accounts").mock(side_effect=_accounts)
        yield router


def _accounts(request):
    import httpx

    q = request.url.params.get("q", "").lower()
    known = [CNPS, CNAM]
    found = [a for a in known if q in a["name"].lower()] if q else known
    return httpx.Response(200, json=page(found))


@pytest.fixture
def server():
    return create_server(Deps(SETTINGS), authenticate=False)


@pytest.fixture
async def call(server):
    async with Client(server) as client:

        async def _call(tool, **arguments):
            result = await client.call_tool(tool, arguments)
            return result.data

        yield _call


@pytest.fixture
async def call_error(server):
    async with Client(server) as client:

        async def _call(tool, **arguments):
            result = await client.call_tool(tool, arguments, raise_on_error=False)
            assert result.is_error
            return result.content[0].text

        yield _call
