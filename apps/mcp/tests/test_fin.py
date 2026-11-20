"""Outils des espaces IAC / IAF et Groupe contre l'API simulée."""

import json

from conftest import API, page


def fin_deal(number, title, **extra):
    return {
        "id": 200 + number,
        "number": number,
        "title": title,
        "nature": "Levée de fonds Equity",
        "sector": "Agro Industrie",
        "stage": "F4",
        "stage_label": "Financement obtenu, à recouvrer",
        "amount": 700_000_000,
        "fee": 4_000_000,
        "fee_received": 1_000_000,
        "commission_rate": 0.03,
        "commission": 21_000_000,
        "revenue": 25_000_000,
        "closing": 1,
        "weighted_revenue": 25_000_000,
        "fee_outstanding": 3_000_000,
        "commission_outstanding": 21_000_000,
        "outstanding": 24_000_000,
        "due_date": "2026-11-01",
        "overdue": False,
        **extra,
    }


async def test_fin_search_deals_uses_the_space_routes_and_links(api, call):
    route = api.get(f"{API}/iaf/deals").respond(json=page([fin_deal(1, "HYBA ENTREPRISE")]))

    result = await call("fin_search_deals", space="iaf", outstanding=True)

    assert route.calls.last.request.url.params["outstanding"] == "true"
    assert result["outstanding"] == 24_000_000
    assert result["total_revenue"] == 25_000_000
    assert result["deals"][0]["url"] == "https://pipeline.test/iaf/affaires?affaire=1"


async def test_fin_update_deals_resolves_numbers_in_the_right_space(api, call):
    api.get(f"{API}/iac/deals").respond(json=page([fin_deal(3, "SOTRAHDOF")]))
    route = api.patch(f"{API}/iac/deals/batch").respond(json={"results": [fin_deal(3, "SOTRAHDOF", stage_label="Mandat signé")]})

    result = await call("fin_update_deals", space="iac", changes=[{"number": 3, "stage": "F2", "fee_received": 5_000_000}])

    body = json.loads(route.calls.last.request.content)
    assert body == {"items": [{"id": 203, "stage": "F2", "fee_received": 5_000_000}]}
    assert result["updated"][0]["stage"] == "Mandat signé"


async def test_fin_recovery_summarises_amounts_due(api, call):
    api.get(f"{API}/iaf/recovery").respond(
        json={
            "totals": {"fee_outstanding": 3_000_000, "commission_outstanding": 21_000_000, "outstanding": 24_000_000, "received": 1_000_000},
            "results": [
                {
                    "deal_id": 201,
                    "deal_number": 1,
                    "deal_title": "HYBA ENTREPRISE",
                    "stage_label": "Financement obtenu, à recouvrer",
                    "fee_outstanding": 3_000_000,
                    "commission_outstanding": 21_000_000,
                    "outstanding": 24_000_000,
                    "fee_received": 1_000_000,
                    "commission_received": 0,
                    "next_step": "Recouvrer la somme due",
                }
            ],
        }
    )

    result = await call("fin_recovery", space="iaf")

    assert result["totals"]["outstanding"] == 24_000_000
    assert result["deals"][0]["deal"] == "1. HYBA ENTREPRISE"
    assert result["url"] == "https://pipeline.test/iaf/encaissements"


async def test_partners_search_and_group_overview(api, call):
    api.get(f"{API}/groupe/partners").respond(
        json=page([{"id": 14, "number": 14, "name": "Odoo", "entity": "IAT", "potential": "Élevé", "priority": "P1", "overdue": True}])
    )
    api.get(f"{API}/groupe/summary").respond(json={"as_of": "2026-11-20", "subsidiaries": [], "totals": {}, "partners": {"count": 16}})

    partners = await call("partners_search", entity="IAT")
    overview = await call("group_overview")

    assert partners["partners"][0]["url"] == "https://pipeline.test/groupe/partenaires?partenaire=14"
    assert partners["partners"][0]["overdue"] is True
    assert overview["partners"]["count"] == 16
