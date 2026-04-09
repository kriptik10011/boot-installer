"""
Tests for V2 Session 11: Investment Portfolio.

Covers: InvestmentAccount CRUD, Holdings CRUD, TargetAllocation,
        Contributions, Allocation analysis, Performance, Rebalancing, Summary.
"""

import pytest
from datetime import date

from app.models.investment import (
    InvestmentAccount, InvestmentHolding, TargetAllocation, InvestmentContribution,
)
from app.services.investment_service import (
    calculate_allocation, calculate_performance, preview_rebalance, get_investment_summary,
)


@pytest.fixture
def sample_account(test_db):
    """Create a sample investment account with holdings."""
    acct = InvestmentAccount(
        name="401k", type="401k", institution="Fidelity",
        is_tax_advantaged=True, is_active=True,
    )
    test_db.add(acct)
    test_db.commit()
    test_db.refresh(acct)

    holdings = [
        InvestmentHolding(
            account_id=acct.id, symbol="VTI", name="Vanguard Total Stock",
            asset_class="us_stocks", quantity=100, cost_basis=15000.0,
            current_price=180.0, current_value=18000.0, last_updated=date.today(),
        ),
        InvestmentHolding(
            account_id=acct.id, symbol="VXUS", name="Vanguard Intl Stock",
            asset_class="intl_stocks", quantity=50, cost_basis=2500.0,
            current_price=55.0, current_value=2750.0, last_updated=date.today(),
        ),
        InvestmentHolding(
            account_id=acct.id, symbol="BND", name="Vanguard Bond Index",
            asset_class="bonds", quantity=30, cost_basis=2400.0,
            current_price=72.0, current_value=2160.0, last_updated=date.today(),
        ),
    ]
    test_db.add_all(holdings)
    test_db.commit()
    return acct


# ============================================================
# Account CRUD (API)
# ============================================================

class TestAccountCRUD:
    def test_create_account(self, client):
        resp = client.post("/api/investments/accounts", json={
            "name": "Roth IRA",
            "type": "roth_ira",
            "institution": "Vanguard",
            "is_tax_advantaged": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Roth IRA"
        assert data["type"] == "roth_ira"
        assert data["is_tax_advantaged"] is True
        assert data["total_value"] == 0.0
        assert data["total_cost_basis"] == 0.0

    def test_list_accounts(self, client):
        client.post("/api/investments/accounts", json={"name": "Acct 1"})
        client.post("/api/investments/accounts", json={"name": "Acct 2"})
        resp = client.get("/api/investments/accounts")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_list_accounts_active_filter(self, client):
        client.post("/api/investments/accounts", json={"name": "Active"})
        r2 = client.post("/api/investments/accounts", json={"name": "Archived"})
        client.delete(f"/api/investments/accounts/{r2.json()['id']}")

        # Default: active only
        resp = client.get("/api/investments/accounts")
        assert len(resp.json()) == 1
        assert resp.json()[0]["name"] == "Active"

        # All accounts
        resp = client.get("/api/investments/accounts?active_only=false")
        assert len(resp.json()) == 2

    def test_get_account(self, client):
        r = client.post("/api/investments/accounts", json={"name": "My 401k"})
        acct_id = r.json()["id"]
        resp = client.get(f"/api/investments/accounts/{acct_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "My 401k"

    def test_get_account_not_found(self, client):
        resp = client.get("/api/investments/accounts/9999")
        assert resp.status_code == 404

    def test_update_account(self, client):
        r = client.post("/api/investments/accounts", json={"name": "Old Name"})
        acct_id = r.json()["id"]
        resp = client.put(f"/api/investments/accounts/{acct_id}", json={"name": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_update_account_not_found(self, client):
        resp = client.put("/api/investments/accounts/9999", json={"name": "X"})
        assert resp.status_code == 404

    def test_archive_account(self, client):
        r = client.post("/api/investments/accounts", json={"name": "To Archive"})
        acct_id = r.json()["id"]
        resp = client.delete(f"/api/investments/accounts/{acct_id}")
        assert resp.status_code == 204

        # Verify archived
        resp = client.get(f"/api/investments/accounts/{acct_id}")
        assert resp.json()["is_active"] is False

    def test_archive_account_not_found(self, client):
        resp = client.delete("/api/investments/accounts/9999")
        assert resp.status_code == 404


# ============================================================
# Holdings CRUD (API)
# ============================================================

class TestHoldingsCRUD:
    def test_create_holding(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "Brokerage"}).json()
        resp = client.post("/api/investments/holdings", json={
            "account_id": acct["id"],
            "symbol": "AAPL",
            "name": "Apple Inc",
            "asset_class": "us_stocks",
            "quantity": 10,
            "cost_basis": 1500.0,
            "current_price": 175.0,
            "current_value": 1750.0,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["symbol"] == "AAPL"
        assert data["gain_loss"] == 250.0
        assert data["gain_loss_pct"] == pytest.approx(16.67, abs=0.01)
        assert data["cost_per_share"] == 150.0

    def test_create_holding_bad_account(self, client):
        resp = client.post("/api/investments/holdings", json={
            "account_id": 9999, "name": "Orphan", "quantity": 1,
        })
        assert resp.status_code == 404

    def test_list_holdings(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "H1", "current_value": 100,
        })
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "H2", "current_value": 200,
        })
        resp = client.get(f"/api/investments/holdings/{acct['id']}")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_list_holdings_bad_account(self, client):
        resp = client.get("/api/investments/holdings/9999")
        assert resp.status_code == 404

    def test_get_holding(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        h = client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "VTI", "quantity": 50,
            "cost_basis": 5000, "current_value": 6000,
        }).json()
        resp = client.get(f"/api/investments/holdings/detail/{h['id']}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "VTI"

    def test_get_holding_not_found(self, client):
        resp = client.get("/api/investments/holdings/detail/9999")
        assert resp.status_code == 404

    def test_update_holding(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        h = client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "VTI", "current_price": 100.0, "current_value": 5000,
        }).json()
        resp = client.put(f"/api/investments/holdings/{h['id']}", json={
            "current_price": 110.0, "current_value": 5500,
        })
        assert resp.status_code == 200
        assert resp.json()["current_price"] == 110.0
        assert resp.json()["current_value"] == 5500

    def test_update_holding_not_found(self, client):
        resp = client.put("/api/investments/holdings/9999", json={"current_price": 1.0})
        assert resp.status_code == 404

    def test_delete_holding(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        h = client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "To Delete",
        }).json()
        resp = client.delete(f"/api/investments/holdings/{h['id']}")
        assert resp.status_code == 204

        # Verify deleted
        resp = client.get(f"/api/investments/holdings/detail/{h['id']}")
        assert resp.status_code == 404

    def test_delete_holding_not_found(self, client):
        resp = client.delete("/api/investments/holdings/9999")
        assert resp.status_code == 404

    def test_holding_computed_fields(self, client):
        """Verify gain/loss, percentage, and cost-per-share calculations."""
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        h = client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "Test",
            "quantity": 20, "cost_basis": 2000.0,
            "current_price": 120.0, "current_value": 2400.0,
        }).json()
        assert h["gain_loss"] == 400.0
        assert h["gain_loss_pct"] == 20.0
        assert h["cost_per_share"] == 100.0

    def test_holding_zero_cost_basis(self, client):
        """Zero cost basis should return 0% gain."""
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        h = client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "Gift",
            "quantity": 10, "cost_basis": 0.0, "current_value": 500.0,
        }).json()
        assert h["gain_loss_pct"] == 0.0
        assert h["cost_per_share"] == 0.0


# ============================================================
# Target Allocation (API)
# ============================================================

class TestTargetAllocation:
    def test_set_target(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        resp = client.post(f"/api/investments/allocation/targets/{acct['id']}", json={
            "asset_class": "us_stocks", "target_pct": 60.0,
        })
        assert resp.status_code == 201
        assert resp.json()["target_pct"] == 60.0

    def test_upsert_target(self, client):
        """Setting same asset class again should update, not create duplicate."""
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        client.post(f"/api/investments/allocation/targets/{acct['id']}", json={
            "asset_class": "bonds", "target_pct": 30.0,
        })
        resp = client.post(f"/api/investments/allocation/targets/{acct['id']}", json={
            "asset_class": "bonds", "target_pct": 40.0,
        })
        assert resp.json()["target_pct"] == 40.0

        # Should only have one entry
        targets = client.get(f"/api/investments/allocation/targets/{acct['id']}").json()
        assert len(targets) == 1

    def test_set_target_bad_account(self, client):
        resp = client.post("/api/investments/allocation/targets/9999", json={
            "asset_class": "bonds", "target_pct": 30.0,
        })
        assert resp.status_code == 404

    def test_list_targets(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        client.post(f"/api/investments/allocation/targets/{acct['id']}", json={
            "asset_class": "us_stocks", "target_pct": 60.0,
        })
        client.post(f"/api/investments/allocation/targets/{acct['id']}", json={
            "asset_class": "bonds", "target_pct": 40.0,
        })
        resp = client.get(f"/api/investments/allocation/targets/{acct['id']}")
        assert len(resp.json()) == 2

    def test_delete_target(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        client.post(f"/api/investments/allocation/targets/{acct['id']}", json={
            "asset_class": "us_stocks", "target_pct": 60.0,
        })
        resp = client.delete(f"/api/investments/allocation/targets/{acct['id']}/us_stocks")
        assert resp.status_code == 204

    def test_delete_target_not_found(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        resp = client.delete(f"/api/investments/allocation/targets/{acct['id']}/nonexistent")
        assert resp.status_code == 404


# ============================================================
# Contributions (API)
# ============================================================

class TestContributions:
    def test_record_contribution(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        resp = client.post(f"/api/investments/contributions/{acct['id']}", json={
            "date": "2026-02-01", "amount": 500.0, "note": "Monthly auto",
        })
        assert resp.status_code == 201
        assert resp.json()["amount"] == 500.0

    def test_record_withdrawal(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        resp = client.post(f"/api/investments/contributions/{acct['id']}", json={
            "date": "2026-02-01", "amount": -200.0, "note": "Emergency",
        })
        assert resp.status_code == 201
        assert resp.json()["amount"] == -200.0

    def test_contribution_bad_account(self, client):
        resp = client.post("/api/investments/contributions/9999", json={
            "date": "2026-02-01", "amount": 100.0,
        })
        assert resp.status_code == 404

    def test_list_contributions(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        client.post(f"/api/investments/contributions/{acct['id']}", json={
            "date": "2026-01-01", "amount": 500.0,
        })
        client.post(f"/api/investments/contributions/{acct['id']}", json={
            "date": "2026-02-01", "amount": 500.0,
        })
        resp = client.get(f"/api/investments/contributions/{acct['id']}")
        assert len(resp.json()) == 2


# ============================================================
# Allocation Analysis (Service + API)
# ============================================================

class TestAllocation:
    def test_allocation_portfolio_wide(self, test_db, sample_account):
        result = calculate_allocation(test_db)
        assert result["total_value"] == pytest.approx(22910.0, abs=0.01)
        assert len(result["allocations"]) == 3

        alloc_map = {a.asset_class: a for a in result["allocations"]}
        assert alloc_map["us_stocks"].current_pct == pytest.approx(78.57, abs=0.01)
        assert alloc_map["intl_stocks"].current_pct == pytest.approx(12.0, abs=0.1)
        assert alloc_map["bonds"].current_pct == pytest.approx(9.43, abs=0.01)

    def test_allocation_with_targets(self, test_db, sample_account):
        test_db.add(TargetAllocation(account_id=sample_account.id, asset_class="us_stocks", target_pct=60.0))
        test_db.add(TargetAllocation(account_id=sample_account.id, asset_class="intl_stocks", target_pct=25.0))
        test_db.add(TargetAllocation(account_id=sample_account.id, asset_class="bonds", target_pct=15.0))
        test_db.commit()

        result = calculate_allocation(test_db, sample_account.id)
        alloc_map = {a.asset_class: a for a in result["allocations"]}
        assert alloc_map["us_stocks"].drift_pct == pytest.approx(18.57, abs=0.1)
        assert alloc_map["intl_stocks"].drift_pct == pytest.approx(-13.0, abs=0.1)

    def test_allocation_empty_portfolio(self, test_db):
        result = calculate_allocation(test_db)
        assert result["total_value"] == 0.0
        assert result["allocations"] == []

    def test_allocation_includes_zero_holding_targets(self, test_db):
        """Target classes with 0 holdings should still appear in allocation."""
        acct = InvestmentAccount(name="Test", type="brokerage", is_active=True)
        test_db.add(acct)
        test_db.commit()
        test_db.refresh(acct)

        test_db.add(InvestmentHolding(
            account_id=acct.id, name="VTI", asset_class="us_stocks",
            quantity=10, current_value=1000,
        ))
        test_db.add(TargetAllocation(account_id=acct.id, asset_class="us_stocks", target_pct=70))
        test_db.add(TargetAllocation(account_id=acct.id, asset_class="bonds", target_pct=30))
        test_db.commit()

        result = calculate_allocation(test_db, acct.id)
        classes = {a.asset_class for a in result["allocations"]}
        assert "bonds" in classes
        bond_alloc = [a for a in result["allocations"] if a.asset_class == "bonds"][0]
        assert bond_alloc.current_value == 0.0
        assert bond_alloc.drift_pct == -30.0

    def test_allocation_api(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "Stock", "asset_class": "us_stocks",
            "current_value": 7000,
        })
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "Bond", "asset_class": "bonds",
            "current_value": 3000,
        })
        resp = client.get("/api/investments/allocation")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_value"] == 10000.0
        assert len(data["allocations"]) == 2


# ============================================================
# Performance (Service + API)
# ============================================================

class TestPerformance:
    def test_performance_calculation(self, test_db, sample_account):
        result = calculate_performance(test_db)
        assert result["total_cost_basis"] == pytest.approx(19900.0, abs=0.01)
        assert result["total_current_value"] == pytest.approx(22910.0, abs=0.01)
        assert result["total_gain_loss"] == pytest.approx(3010.0, abs=0.01)
        assert result["total_gain_loss_pct"] == pytest.approx(15.13, abs=0.01)
        assert len(result["holdings"]) == 3

    def test_performance_weights(self, test_db, sample_account):
        result = calculate_performance(test_db)
        holding_map = {h.name: h for h in result["holdings"]}
        assert holding_map["Vanguard Total Stock"].weight_pct == pytest.approx(78.57, abs=0.1)

    def test_performance_with_contributions(self, test_db, sample_account):
        test_db.add(InvestmentContribution(
            account_id=sample_account.id, date=date(2026, 1, 1), amount=1000.0,
        ))
        test_db.add(InvestmentContribution(
            account_id=sample_account.id, date=date(2026, 2, 1), amount=1000.0,
        ))
        test_db.commit()

        result = calculate_performance(test_db)
        assert result["total_contributions"] == 2000.0

    def test_performance_empty(self, test_db):
        result = calculate_performance(test_db)
        assert result["total_current_value"] == 0.0
        assert result["total_gain_loss_pct"] == 0.0

    def test_performance_api(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "VTI",
            "quantity": 10, "cost_basis": 1000, "current_value": 1200,
        })
        resp = client.get("/api/investments/performance")
        assert resp.status_code == 200
        assert resp.json()["total_gain_loss"] == 200.0

    def test_performance_per_account(self, client):
        a1 = client.post("/api/investments/accounts", json={"name": "A1"}).json()
        a2 = client.post("/api/investments/accounts", json={"name": "A2"}).json()
        client.post("/api/investments/holdings", json={
            "account_id": a1["id"], "name": "H1", "cost_basis": 1000, "current_value": 1500,
        })
        client.post("/api/investments/holdings", json={
            "account_id": a2["id"], "name": "H2", "cost_basis": 2000, "current_value": 2200,
        })

        resp_all = client.get("/api/investments/performance")
        assert resp_all.json()["total_gain_loss"] == 700.0

        resp_a1 = client.get(f"/api/investments/performance?account_id={a1['id']}")
        assert resp_a1.json()["total_gain_loss"] == 500.0


# ============================================================
# Rebalancing (Service + API)
# ============================================================

class TestRebalancing:
    def test_rebalance_preview(self, test_db, sample_account):
        test_db.add(TargetAllocation(account_id=sample_account.id, asset_class="us_stocks", target_pct=60.0))
        test_db.add(TargetAllocation(account_id=sample_account.id, asset_class="intl_stocks", target_pct=25.0))
        test_db.add(TargetAllocation(account_id=sample_account.id, asset_class="bonds", target_pct=15.0))
        test_db.commit()

        result = preview_rebalance(test_db, sample_account.id)
        assert result["total_value"] == pytest.approx(22910.0, abs=0.01)
        assert len(result["trades"]) == 3

        trade_map = {t.asset_class: t for t in result["trades"]}
        assert trade_map["us_stocks"].action == "sell"
        assert trade_map["us_stocks"].trade_amount < 0
        assert trade_map["intl_stocks"].action == "buy"
        assert trade_map["intl_stocks"].trade_amount > 0

        # Buys ~= sells (money is just rebalanced)
        assert result["total_buys"] == pytest.approx(result["total_sells"], abs=1.0)

    def test_rebalance_no_targets(self, test_db, sample_account):
        result = preview_rebalance(test_db, sample_account.id)
        assert result["trades"] == []

    def test_rebalance_empty_portfolio(self, test_db):
        acct = InvestmentAccount(name="Empty", is_active=True)
        test_db.add(acct)
        test_db.commit()
        test_db.refresh(acct)
        test_db.add(TargetAllocation(account_id=acct.id, asset_class="us_stocks", target_pct=100))
        test_db.commit()

        result = preview_rebalance(test_db, acct.id)
        assert result["trades"] == []

    def test_rebalance_small_drift_skipped(self, test_db):
        """Trades under $1 threshold should be excluded."""
        acct = InvestmentAccount(name="Precise", is_active=True)
        test_db.add(acct)
        test_db.commit()
        test_db.refresh(acct)

        test_db.add(InvestmentHolding(
            account_id=acct.id, name="VTI", asset_class="us_stocks",
            quantity=1, current_value=100.0,
        ))
        test_db.add(TargetAllocation(account_id=acct.id, asset_class="us_stocks", target_pct=100.0))
        test_db.commit()

        result = preview_rebalance(test_db, acct.id)
        assert len(result["trades"]) == 0

    def test_rebalance_api(self, client):
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "Stock", "asset_class": "us_stocks",
            "current_value": 8000,
        })
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "Bond", "asset_class": "bonds",
            "current_value": 2000,
        })
        client.post(f"/api/investments/allocation/targets/{acct['id']}", json={
            "asset_class": "us_stocks", "target_pct": 60.0,
        })
        client.post(f"/api/investments/allocation/targets/{acct['id']}", json={
            "asset_class": "bonds", "target_pct": 40.0,
        })

        resp = client.post(f"/api/investments/rebalance/preview?account_id={acct['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["trades"]) == 2
        stock_trade = [t for t in data["trades"] if t["asset_class"] == "us_stocks"][0]
        assert stock_trade["action"] == "sell"

    def test_rebalance_api_bad_account(self, client):
        resp = client.post("/api/investments/rebalance/preview?account_id=9999")
        assert resp.status_code == 404


# ============================================================
# Summary (Service + API)
# ============================================================

class TestSummary:
    def test_summary_empty(self, client):
        resp = client.get("/api/investments/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_portfolio_value"] == 0.0
        assert data["account_count"] == 0

    def test_summary_with_data(self, test_db, sample_account):
        taxable = InvestmentAccount(name="Brokerage", type="brokerage", is_active=True)
        test_db.add(taxable)
        test_db.commit()
        test_db.refresh(taxable)
        test_db.add(InvestmentHolding(
            account_id=taxable.id, name="SPY", asset_class="us_stocks",
            quantity=5, cost_basis=2000, current_value=2500,
        ))
        test_db.add(InvestmentContribution(
            account_id=sample_account.id, date=date(2026, 1, 1), amount=5000,
        ))
        test_db.commit()

        result = get_investment_summary(test_db)
        assert result["account_count"] == 2
        assert result["holding_count"] == 4
        assert result["total_portfolio_value"] == pytest.approx(25410.0, abs=0.01)
        assert result["tax_advantaged_value"] == pytest.approx(22910.0, abs=0.01)
        assert result["taxable_value"] == pytest.approx(2500.0, abs=0.01)
        assert result["total_contributions"] == 5000.0

    def test_summary_api(self, client):
        acct = client.post("/api/investments/accounts", json={
            "name": "401k", "is_tax_advantaged": True,
        }).json()
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "VTI",
            "cost_basis": 10000, "current_value": 12000,
        })
        resp = client.get("/api/investments/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_portfolio_value"] == 12000.0
        assert data["total_gain_loss"] == 2000.0
        assert data["tax_advantaged_value"] == 12000.0


# ============================================================
# Model Computed Properties (Direct DB)
# ============================================================

class TestModelProperties:
    def test_account_total_value(self, test_db):
        acct = InvestmentAccount(name="Test", is_active=True)
        test_db.add(acct)
        test_db.commit()
        test_db.refresh(acct)

        test_db.add(InvestmentHolding(account_id=acct.id, name="A", current_value=1000))
        test_db.add(InvestmentHolding(account_id=acct.id, name="B", current_value=2000))
        test_db.commit()
        test_db.refresh(acct)

        assert acct.total_value == 3000.0

    def test_account_gain_loss_pct(self, test_db):
        acct = InvestmentAccount(name="Test", is_active=True)
        test_db.add(acct)
        test_db.commit()
        test_db.refresh(acct)

        test_db.add(InvestmentHolding(
            account_id=acct.id, name="A",
            cost_basis=1000, current_value=1200,
        ))
        test_db.commit()
        test_db.refresh(acct)

        assert acct.total_gain_loss == 200.0
        assert acct.total_gain_loss_pct == 20.0

    def test_account_zero_cost_basis(self, test_db):
        acct = InvestmentAccount(name="Test", is_active=True)
        test_db.add(acct)
        test_db.commit()
        test_db.refresh(acct)
        assert acct.total_gain_loss_pct == 0.0

    def test_holding_zero_quantity(self, test_db):
        acct = InvestmentAccount(name="Test", is_active=True)
        test_db.add(acct)
        test_db.commit()
        h = InvestmentHolding(
            account_id=acct.id, name="Sold", quantity=0, cost_basis=0, current_value=0,
        )
        test_db.add(h)
        test_db.commit()
        test_db.refresh(h)
        assert h.cost_per_share == 0.0
        assert h.gain_loss_pct == 0.0


# ============================================================
# Edge Cases & Regression Guards
# ============================================================

class TestEdgeCases:
    def test_inactive_account_excluded_from_allocation(self, test_db):
        """Inactive accounts should not appear in portfolio-wide allocation."""
        active = InvestmentAccount(name="Active", is_active=True)
        inactive = InvestmentAccount(name="Inactive", is_active=False)
        test_db.add_all([active, inactive])
        test_db.commit()
        test_db.refresh(active)
        test_db.refresh(inactive)

        test_db.add(InvestmentHolding(
            account_id=active.id, name="A", asset_class="us_stocks", current_value=1000,
        ))
        test_db.add(InvestmentHolding(
            account_id=inactive.id, name="B", asset_class="bonds", current_value=5000,
        ))
        test_db.commit()

        result = calculate_allocation(test_db)
        assert result["total_value"] == 1000.0
        assert len(result["allocations"]) == 1
        assert result["allocations"][0].asset_class == "us_stocks"

    def test_multiple_holdings_same_class(self, test_db):
        """Multiple holdings in same asset class should be aggregated."""
        acct = InvestmentAccount(name="Test", is_active=True)
        test_db.add(acct)
        test_db.commit()
        test_db.refresh(acct)

        test_db.add(InvestmentHolding(
            account_id=acct.id, name="VTI", asset_class="us_stocks", current_value=5000,
        ))
        test_db.add(InvestmentHolding(
            account_id=acct.id, name="VOO", asset_class="us_stocks", current_value=3000,
        ))
        test_db.add(InvestmentHolding(
            account_id=acct.id, name="BND", asset_class="bonds", current_value=2000,
        ))
        test_db.commit()

        result = calculate_allocation(test_db)
        alloc_map = {a.asset_class: a for a in result["allocations"]}
        assert alloc_map["us_stocks"].current_value == 8000.0
        assert alloc_map["us_stocks"].current_pct == 80.0
        assert alloc_map["bonds"].current_value == 2000.0

    def test_account_response_includes_computed_totals(self, client):
        """Account list response should include computed totals from holdings."""
        acct = client.post("/api/investments/accounts", json={"name": "A"}).json()
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "VTI",
            "cost_basis": 5000, "current_value": 6000,
        })
        client.post("/api/investments/holdings", json={
            "account_id": acct["id"], "name": "BND",
            "cost_basis": 3000, "current_value": 2800,
        })

        resp = client.get(f"/api/investments/accounts/{acct['id']}")
        data = resp.json()
        assert data["total_value"] == 8800.0
        assert data["total_cost_basis"] == 8000.0
        assert data["total_gain_loss"] == 800.0
        assert data["total_gain_loss_pct"] == 10.0
