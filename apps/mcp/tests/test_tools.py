"""Outils de lecture et d'écriture contre l'API simulée."""

import json

import httpx
from conftest import API, CNPS, ME, SETTINGS, deal, page

from pipeline_mcp.auth import PipelineTokenVerifier


async def test_whoami_gives_the_person_and_today(api, call):
    result = await call("whoami")

    assert result == {"user": ME["user"], "today": "2026-10-19", "app_url": "https://pipeline.test"}
    assert api.calls.last.request.headers["Authorization"] == "Bearer iat_tok"


async def test_search_deals_resolves_the_account_and_translates_filters(api, call):
    route = api.get(f"{API}/deals").respond(json=page([deal(8, "Renouvellement ManageEngine", closing=0.6)]))

    result = await call("search_deals", account="cnps", open=True, priority="P1")

    params = route.calls.last.request.url.params
    assert params["account_id"] == "2"
    assert params["open"] == "true"
    assert params["priority"] == "P1"
    assert result["total_amount"] == 22700000
    assert result["weighted_amount"] == 13620000
    assert result["deals"][0] == {
        "number": 8,
        "title": "Renouvellement ManageEngine",
        "account": "CNPS",
        "stage": "M5 – Négociation / signature",
        "priority": "P1",
        "amount": 22700000,
        "closing": 0.6,
        "weighted_amount": 13620000,
        "due_date": "2026-10-23",
        "url": "https://pipeline.test/affaires?affaire=8",
    }


async def test_unknown_account_names_the_known_ones_before_writing(api, call_error):
    batch = api.post(f"{API}/actions/batch")

    message = await call_error("create_actions", actions=[{"title": "Relancer", "account": "Sodeci"}])

    assert "Aucun compte « Sodeci »" in message
    assert "CNPS, CNAM" in message
    assert not batch.called


async def test_create_actions_attaches_the_account_in_one_batch(api, call):
    route = api.post(f"{API}/actions/batch").respond(
        201,
        json={
            "results": [
                {"id": 39, "number": 39, "title": "Appeler la DSI", "status": "À faire", "account_name": "CNPS"}
            ]
        },
    )

    result = await call(
        "create_actions",
        actions=[{"title": "Appeler la DSI", "account": "CNPS", "due_date": "2026-10-21", "priority": "P1"}],
    )

    sent = json.loads(route.calls.last.request.content)
    assert sent == {
        "items": [
            {
                "title": "Appeler la DSI",
                "due_date": "2026-10-21",
                "owner": "Commercial IAT",
                "priority": "P1",
                "status": "À faire",
                "account_id": 2,
                "related_to": "CNPS",
            }
        ]
    }
    assert result["created"][0]["url"] == "https://pipeline.test/actions?action=39"


async def test_update_deals_sends_only_the_given_fields_and_null_clears(api, call):
    api.get(f"{API}/deals").respond(json=page([deal(8, "Renouvellement ManageEngine")]))
    route = api.patch(f"{API}/deals/batch").respond(
        json={"results": [deal(8, "Renouvellement ManageEngine", stage="M6", closing=1)]}
    )

    result = await call("update_deals", changes=[{"number": 8, "stage": "M6", "closing": 1, "due_date": None}])

    assert json.loads(route.calls.last.request.content) == {
        "items": [{"id": 8, "stage": "M6", "closing": 1.0, "due_date": None}]
    }
    assert result["updated"][0]["stage"] == "M6 – Gagné"


async def test_unknown_deal_number_is_reported(api, call_error):
    api.get(f"{API}/deals").respond(json=page([]))

    message = await call_error("get_deal", number=99)

    assert "Aucune affaire n° 99" in message


async def test_api_refusal_is_passed_on_in_french(api, call_error):
    api.patch(f"{API}/renewals/batch").respond(
        400, json={"error": "Élément 0 : Le renouvellement n° 42 est introuvable."}
    )

    message = await call_error("update_renewals", changes=[{"id": 42, "status": "Offre envoyée"}])

    assert message.endswith("Le renouvellement n° 42 est introuvable.")


async def test_expired_token_says_how_to_get_a_new_one(api, call_error):
    api.get(f"{API}/summary").respond(401, json={"error": "Jeton invalide"})

    message = await call_error("pipeline_overview")

    assert "Réglages > Connecter Claude" in message


async def test_get_account_reads_the_overview_by_slug(api, call):
    route = api.get(f"{API}/accounts/cnps/overview").respond(
        json={
            "account": {**CNPS, "sector": "Protection sociale", "health": None},
            "deals": [deal(8, "Renouvellement ManageEngine")],
            "open_offers_amount": 81700000,
            "invoices": [
                {
                    "id": 5,
                    "product": "Licences ManageEngine",
                    "fiscal_year": 2025,
                    "amount": 21578849,
                    "collected": 21578849,
                    "balance": 0,
                }
            ],
            "invoice_totals": {"amount": 21578849, "balance": 0},
            "renewals": [],
            "opportunities": [],
            "contacts": [{"id": 7, "name": "Gballet BEUGRE", "role": "DSI", "account_name": "CNPS"}],
        }
    )

    result = await call("get_account", account="CNPS")

    assert route.called
    assert result["url"] == "https://pipeline.test/comptes/cnps"
    assert result["fiche"] == {"sector": "Protection sociale"}
    assert result["contacts"][0]["url"] == "https://pipeline.test/contacts?contact=7"


async def test_auth_accepts_valid_tokens_and_rejects_others():
    def handler(request):
        ok = request.headers["Authorization"] == "Bearer iat_good"
        return httpx.Response(200 if ok else 401, json=ME if ok else {"error": "Jeton invalide"})

    verifier = PipelineTokenVerifier(SETTINGS, httpx.MockTransport(handler))

    accepted = await verifier.verify_token("iat_good")
    assert accepted is not None and accepted.client_id == "1"
    assert await verifier.verify_token("iat_bad") is None


async def test_account_named_with_extra_words_is_found(api, call):
    route = api.get(f"{API}/deals").respond(json=page([]))

    await call("search_deals", account="la CNPS")

    assert route.calls.last.request.url.params["account_id"] == "2"
