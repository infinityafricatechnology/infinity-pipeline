"""Outils de l'espace IAP contre l'API simulée."""

import json

from conftest import API, page


def iap_deal(number, title, **extra):
    return {
        "id": 100 + number,
        "number": number,
        "title": title,
        "nature": "Vente bien immobilier",
        "stage": "P1",
        "stage_label": "Mandat signé",
        "amount": 300_000_000,
        "commission_rate": 0.025,
        "commission": 7_500_000,
        "closing": 0.7,
        "weighted_commission": 5_250_000,
        "apporteur": "Koumba Assanvo",
        "closeur": "Koumba Assanvo",
        "due_date": "2026-12-01",
        "overdue": False,
        "commission_base": 7_500_000,
        "commission_estimated": True,
        "shares": [
            {
                "person": "Koumba Assanvo",
                "role": "apport_closing",
                "rate": 0.15,
                "amount": 1_125_000,
                "status": "expected",
            }
        ],
        **extra,
    }


async def test_iap_search_deals_filters_and_links_to_the_iap_space(api, call):
    route = api.get(f"{API}/iap/deals").respond(json=page([iap_deal(8, "Villa 408m² attoban")]))

    result = await call("iap_search_deals", person="Koumba Assanvo", open=True)

    params = route.calls.last.request.url.params
    assert params["person"] == "Koumba Assanvo"
    assert params["open"] == "true"
    assert result["total_commission"] == 7_500_000
    assert result["weighted_commission"] == 5_250_000
    deal = result["deals"][0]
    assert deal["url"] == "https://pipeline.test/iap/affaires?affaire=8"
    assert "closeur" not in deal  # même personne que l'apporteur : non répété


async def test_iap_get_deal_gives_the_commission_split(api, call):
    api.get(f"{API}/iap/deals").respond(json=page([iap_deal(8, "Villa 408m² attoban", closeur="Sali Traoré")]))
    api.get(f"{API}/iap/actions").respond(json=page([]))

    result = await call("iap_get_deal", number=8)

    assert result["closeur"] == "Sali Traoré"
    assert result["commission_split"]["estimated"] is True
    assert result["commission_split"]["shares"][0]["amount"] == 1_125_000


async def test_iap_update_deals_resolves_the_number_and_sends_only_given_fields(api, call):
    api.get(f"{API}/iap/deals").respond(json=page([iap_deal(36, "Villa en location")]))
    route = api.patch(f"{API}/iap/deals/batch").respond(
        json={"results": [iap_deal(36, "Villa en location", stage="P5")]}
    )

    await call(
        "iap_update_deals", changes=[{"number": 36, "stage": "P5", "commission_received": 600000, "next_step": None}]
    )

    body = json.loads(route.calls.last.request.content)
    assert body == {"items": [{"id": 136, "stage": "P5", "commission_received": 600000, "next_step": None}]}


async def test_iap_create_actions_attaches_the_deal_by_number(api, call):
    api.get(f"{API}/iap/deals").respond(json=page([iap_deal(14, "Terrain 3.042m² Bietry")]))
    route = api.post(f"{API}/iap/actions/batch").respond(
        201,
        json={
            "results": [
                {
                    "id": 7,
                    "number": 7,
                    "title": "Signer le mandat",
                    "deal_number": 14,
                    "deal_title": "Terrain 3.042m² Bietry",
                }
            ]
        },
    )

    result = await call("iap_create_actions", actions=[{"title": "Signer le mandat", "deal": 14}])

    body = json.loads(route.calls.last.request.content)
    assert body["items"][0]["deal_id"] == 114
    assert "deal" not in body["items"][0]
    assert result["created"][0]["deal"] == "14. Terrain 3.042m² Bietry"


async def test_unknown_iap_deal_is_reported_before_writing(api, call_error):
    api.get(f"{API}/iap/deals").respond(json=page([]))
    batch = api.patch(f"{API}/iap/deals/batch")

    message = await call_error("iap_update_deals", changes=[{"number": 99, "stage": "P2"}])

    assert "Aucune affaire IAP n° 99" in message
    assert not batch.called
