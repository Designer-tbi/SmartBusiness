"""
Backend regression tests for refactored API helpers in /app/api/_lib/.
Tests run against PRODUCTION Vercel URL (pre-refactor code) to establish baseline.
After redeploy, same tests will validate refactor doesn't break routes.
"""
import os
import pytest
import requests

BASE_URL = "https://smart-business-sigma.vercel.app"
SUPERADMIN_EMAIL = "eden@tbi-center.fr"
SUPERADMIN_PASSWORD = "loub@ki2014D"

TIMEOUT = 30


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_session(session):
    """Login as superadmin once and reuse cookies"""
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
        timeout=TIMEOUT,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    return session


# ---------- Health ----------
class TestHealth:
    def test_health_endpoint(self, session):
        r = session.get(f"{BASE_URL}/api/health", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("database") == "postgres"


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self, session):
        r = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # JWT cookie should be set (name='token')
        assert "token" in session.cookies, f"JWT cookie missing; cookies={list(session.cookies.keys())}"
        # response returns user object directly
        assert data.get("email") == SUPERADMIN_EMAIL
        assert data.get("role") == "superadmin"

    def test_login_invalid(self, session):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERADMIN_EMAIL, "password": "wrongpass"},
            timeout=TIMEOUT,
        )
        assert r.status_code in (400, 401, 403)

    def test_auth_me(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/auth/me", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        # Returns user profile
        # Some APIs wrap as { user: {...} }, some return user directly
        email = data.get("email") or (data.get("user") or {}).get("email")
        assert email == SUPERADMIN_EMAIL


# ---------- Authenticated GET list endpoints ----------
AUTH_LIST_ENDPOINTS = [
    "/api/customers",
    "/api/leads",
    "/api/opportunities",
    "/api/products",
    "/api/quotes",
    "/api/invoices",
    "/api/commissions",
    "/api/activities",
    "/api/objectives",
    "/api/agent/payments",
    "/api/categories",
    "/api/portfolio-items",
    "/api/reports",
    "/api/documents",
]


@pytest.mark.parametrize("endpoint", AUTH_LIST_ENDPOINTS)
def test_auth_required_list_returns_200(auth_session, endpoint):
    r = auth_session.get(f"{BASE_URL}{endpoint}", timeout=TIMEOUT)
    assert r.status_code == 200, f"{endpoint} -> {r.status_code}: {r.text[:300]}"
    # Should be JSON (list or object)
    try:
        data = r.json()
    except ValueError:
        pytest.fail(f"{endpoint} response not JSON: {r.text[:200]}")
    # Most return arrays
    assert isinstance(data, (list, dict))


def test_auth_required_without_token_returns_401(session):
    """Verify auth middleware still enforces auth"""
    fresh = requests.Session()
    r = fresh.get(f"{BASE_URL}/api/customers", timeout=TIMEOUT)
    assert r.status_code in (401, 403), r.text[:200]


# ---------- Admin / Superadmin ----------
class TestAdmin:
    def test_admin_stats(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/admin/stats", timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, dict)

    def test_superadmin_dashboard(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/superadmin/dashboard", timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, dict)


# ---------- PayPal public endpoints ----------
class TestPayPal:
    def test_paypal_config_public(self, session):
        # No auth needed
        fresh = requests.Session()
        r = fresh.get(f"{BASE_URL}/api/public/paypal/config", timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "clientId" in data
        assert data.get("mode") == "live"
        assert isinstance(data["clientId"], str) and len(data["clientId"]) > 0

    def test_paypal_create_order_quote_5(self):
        """Test PayPal create-order against quote QT-2026-393 (id=5), 206500 FCFA, UNPAID."""
        fresh = requests.Session()
        r = fresh.post(
            f"{BASE_URL}/api/public/quotes/5/paypal/create-order",
            json={},
            timeout=TIMEOUT,
        )
        # Must succeed -- this is the critical PayPal helper path
        assert r.status_code == 200, f"PayPal create-order failed: {r.status_code} {r.text[:500]}"
        data = r.json()
        assert "id" in data and isinstance(data["id"], str) and len(data["id"]) > 0
        # Optional fields per refactor contract
        assert data.get("paidCurrency") == "EUR" or "paidCurrency" in data
        # Original amount should be FCFA value
        if "originalAmount" in data:
            assert float(data["originalAmount"]) > 0
