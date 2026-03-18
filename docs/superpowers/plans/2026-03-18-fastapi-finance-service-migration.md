# FastAPI Finance Service Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the finance-domain backend from the current Node/Express process into a new FastAPI service while preserving the existing `/api/finance/*` client contract during cutover.

**Architecture:** Keep the current Node server as the temporary shell for static/Vite hosting, watchlist, alerts, chat, and alert-monitor lifecycle. Stand up a separate `python-backend` FastAPI service that owns finance-domain routes behind domain-specific adapters (`market_data`, `news`, `economics`, `universe`, `analytics`). During migration, Node proxies `/api/finance/*` to FastAPI so the React client stays stable while route families cut over in controlled slices.

**Tech Stack:** FastAPI, Pydantic v2, httpx, pytest, Uvicorn, FinanceToolkit, FinanceDatabase, existing Node/Express proxy shell, existing React client, existing TypeScript finance contract.

---

## File Map

### New Python service
- Create: `python-backend/pyproject.toml`
- Create: `python-backend/app/main.py`
- Create: `python-backend/app/core/config.py`
- Create: `python-backend/app/core/http.py`
- Create: `python-backend/app/api/router.py`
- Create: `python-backend/app/api/routes/quotes.py`
- Create: `python-backend/app/api/routes/news.py`
- Create: `python-backend/app/api/routes/economics.py`
- Create: `python-backend/app/api/routes/screener.py`
- Create: `python-backend/app/api/routes/portfolio.py`
- Create: `python-backend/app/models/common.py`
- Create: `python-backend/app/models/quotes.py`
- Create: `python-backend/app/models/news.py`
- Create: `python-backend/app/models/economics.py`
- Create: `python-backend/app/models/screener.py`
- Create: `python-backend/app/models/portfolio.py`
- Create: `python-backend/app/services/market_data_service.py`
- Create: `python-backend/app/services/news_service.py`
- Create: `python-backend/app/services/economics_service.py`
- Create: `python-backend/app/services/screener_service.py`
- Create: `python-backend/app/services/portfolio_service.py`
- Create: `python-backend/app/providers/current_market_data_adapter.py`
- Create: `python-backend/app/providers/financetoolkit_adapter.py`
- Create: `python-backend/app/providers/financedatabase_adapter.py`
- Create: `python-backend/app/providers/fred_adapter.py`
- Create: `python-backend/tests/conftest.py`
- Create: `python-backend/tests/test_health.py`
- Create: `python-backend/tests/test_quotes_routes.py`
- Create: `python-backend/tests/test_news_routes.py`
- Create: `python-backend/tests/test_economics_routes.py`
- Create: `python-backend/tests/test_screener_routes.py`
- Create: `python-backend/tests/test_portfolio_routes.py`
- Create: `python-backend/tests/test_contract_models.py`

### Node shell changes
- Create: `src/server/financeProxy.ts`
- Create: `src/server/financeProxy.test.ts`
- Modify: `src/server/routes.ts`
- Modify: `src/server/index.ts`
- Modify: `src/package.json`
- Modify: `docs/live/current-focus.md`
- Modify: `docs/live/progress.md`
- Modify: `docs/live/todo.md`

### Optional parity fixtures if needed during implementation
- Create: `python-backend/tests/fixtures/quotes_aapl.json`
- Create: `python-backend/tests/fixtures/ohlcv_aapl_1d_5m.json`
- Create: `python-backend/tests/fixtures/news_aapl.json`
- Create: `python-backend/tests/fixtures/economics_snapshot.json`

---

## Migration Rules

- Keep `/api/finance/*` request and response shapes stable unless a deliberate contract change is already landed in the TypeScript client.
- Do **not** migrate `/api/watchlist`, `/api/alerts`, `/api/chat`, or static/Vite hosting in the first phase.
- `FinanceDatabase` is for universe/reference enrichment only.
- `FinanceToolkit` is for analytics, fundamentals, economics, and portfolio workflows, not as the sole current-market-data feed.
- Current quote/OHLCV/news freshness semantics must remain honest: fallback or reference data must stay visibly non-current.
- Every migrated route family needs parity tests before the Node proxy flips over.

---

## Chunk 1: Scaffold the Python finance service

### Task 1: Create the FastAPI project skeleton

**Files:**
- Create: `python-backend/pyproject.toml`
- Create: `python-backend/app/main.py`
- Create: `python-backend/app/api/router.py`
- Create: `python-backend/app/core/config.py`
- Create: `python-backend/app/core/http.py`
- Test: `python-backend/tests/test_health.py`

- [ ] **Step 1: Write the failing health test**

```python
from fastapi.testclient import TestClient
from app.main import app


def test_healthcheck_returns_ok():
    client = TestClient(app)

    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd python-backend && pytest tests/test_health.py -q`
Expected: FAIL because the FastAPI app or route does not exist yet.

- [ ] **Step 3: Add minimal FastAPI app scaffolding**

```python
from fastapi import FastAPI

app = FastAPI(title="BLMTRM Finance Service")


@app.get("/healthz")
def healthcheck() -> dict[str, bool]:
    return {"ok": True}
```

Also add `pyproject.toml` dependencies:
- `fastapi`
- `uvicorn`
- `httpx`
- `pydantic`
- `pytest`
- `financetoolkit`
- `financedatabase`

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd python-backend && pytest tests/test_health.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-backend/pyproject.toml python-backend/app python-backend/tests/test_health.py
git commit -m "feat: scaffold fastapi finance service"
```

### Task 2: Establish route-group layout and settings

**Files:**
- Modify: `python-backend/app/main.py`
- Create: `python-backend/app/api/routes/quotes.py`
- Create: `python-backend/app/api/routes/news.py`
- Create: `python-backend/app/api/routes/economics.py`
- Create: `python-backend/app/api/routes/screener.py`
- Create: `python-backend/app/api/routes/portfolio.py`
- Modify: `python-backend/app/api/router.py`
- Modify: `python-backend/app/core/config.py`
- Test: `python-backend/tests/test_health.py`

- [ ] **Step 1: Add a failing router-registration test**

```python
def test_openapi_lists_finance_routes():
    client = TestClient(app)

    schema = client.get("/openapi.json").json()

    assert "/api/finance/quotes" in schema["paths"]
    assert "/api/finance/sparklines" in schema["paths"]
    assert "/api/finance/news" in schema["paths"]
    assert "/api/finance/economics" in schema["paths"]

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd python-backend && pytest tests/test_health.py -q`
Expected: FAIL because the routers are not mounted yet.

- [ ] **Step 3: Add empty APIRouter modules and include them**

Create route modules with placeholder handlers returning `501` or stub values so the OpenAPI paths exist. Put the shared `/api/finance` prefix in `app/api/router.py`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd python-backend && pytest tests/test_health.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-backend/app/api python-backend/app/core python-backend/tests/test_health.py
git commit -m "feat: add fastapi route group skeleton"
```

---

## Chunk 2: Lock the finance contract before moving behavior

### Task 3: Mirror the existing finance response models in Pydantic

**Files:**
- Create: `python-backend/app/models/common.py`
- Create: `python-backend/app/models/quotes.py`
- Create: `python-backend/app/models/news.py`
- Create: `python-backend/app/models/economics.py`
- Create: `python-backend/app/models/screener.py`
- Create: `python-backend/app/models/portfolio.py`
- Test: `python-backend/tests/test_contract_models.py`
- Reference: `src/client/src/lib/finance.ts`
- Reference: `src/server/dataStatus.ts`

- [ ] **Step 1: Write failing model-shape tests**

```python
from app.models.common import DataStatus
from app.models.quotes import Quote, OHLCVSeries


def test_quote_model_exposes_status_fields():
    quote = Quote.model_validate({
        "symbol": "AAPL",
        "price": 100,
        "change": 1,
        "changePercent": 1,
        "quoteSource": "Yahoo Finance",
        "isLive": True,
        "status": {
            "provider": "Yahoo Finance",
            "freshness": "current",
            "asOf": "2026-03-18T12:00:00Z",
            "delayLabel": "Current session",
            "isFallback": False,
        },
    })

    assert quote.status.freshness == "current"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd python-backend && pytest tests/test_contract_models.py -q`
Expected: FAIL because the models do not exist yet.

- [ ] **Step 3: Add Pydantic models that match current TypeScript contracts**

Model at least:
- `DataFreshness`
- `DataStatus`
- `Quote`
- `OHLCVBar`
- `OHLCVSeries`
- `NewsItem`
- `NewsArticle`
- `EconomicsSnapshot`
- `EconomicCalendarEvent`
- `EconomicEventDetail`
- `PortfolioAnalyticsRequest`
- `PortfolioAnalyticsResponse`

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd python-backend && pytest tests/test_contract_models.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-backend/app/models python-backend/tests/test_contract_models.py
git commit -m "feat: add pydantic finance contract models"
```

### Task 4: Add a shared provider/status abstraction in Python

**Files:**
- Create: `python-backend/app/services/market_data_service.py`
- Create: `python-backend/app/providers/current_market_data_adapter.py`
- Create: `python-backend/app/providers/fred_adapter.py`
- Modify: `python-backend/app/models/common.py`
- Test: `python-backend/tests/test_quotes_routes.py`
- Test: `python-backend/tests/test_economics_routes.py`

- [ ] **Step 1: Write failing tests for honest status labeling**

```python
def test_quote_route_marks_reference_fallback_non_current(...):
    ...
    assert payload[0]["status"]["freshness"] == "reference"
    assert payload[0]["status"]["isFallback"] is True
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd python-backend && pytest tests/test_quotes_routes.py tests/test_economics_routes.py -q`
Expected: FAIL because the service layer and adapters do not exist yet.

- [ ] **Step 3: Implement a Python status helper equivalent to current `buildDataStatus`**

The helper must centralize:
- `provider`
- `freshness`
- `as_of`
- `delay_label`
- `is_fallback`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd python-backend && pytest tests/test_quotes_routes.py tests/test_economics_routes.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-backend/app/services python-backend/app/providers python-backend/tests/test_quotes_routes.py python-backend/tests/test_economics_routes.py
git commit -m "feat: add python provider status abstraction"
```

---

## Chunk 3: Migrate the low-risk finance route families first

### Task 5: Implement screener and peers on top of FinanceDatabase enrichment

**Files:**
- Create: `python-backend/app/providers/financedatabase_adapter.py`
- Create: `python-backend/app/services/screener_service.py`
- Modify: `python-backend/app/api/routes/screener.py`
- Test: `python-backend/tests/test_screener_routes.py`
- Reference: `src/server/routes.ts`
- Reference: `src/server/marketData.ts`

- [ ] **Step 1: Write failing route tests for `/api/finance/screener` and `/api/finance/peers`**

```python
def test_screener_filters_by_sector_and_pe_range(...):
    ...

def test_peers_returns_quote_like_rows_for_symbol(...):
    ...
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd python-backend && pytest tests/test_screener_routes.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement the minimal adapter/service behavior**

Rules:
- Use `FinanceDatabase` for universe lookup and enrichment.
- Do not claim the library itself provides current quotes.
- If live quote data is still required for output parity, join the reference universe with the current-market-data adapter.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd python-backend && pytest tests/test_screener_routes.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-backend/app/providers/financedatabase_adapter.py python-backend/app/services/screener_service.py python-backend/app/api/routes/screener.py python-backend/tests/test_screener_routes.py
git commit -m "feat: add python screener and peers routes"
```

### Task 6: Implement economics routes behind Python adapters

**Files:**
- Create: `python-backend/app/services/economics_service.py`
- Modify: `python-backend/app/api/routes/economics.py`
- Modify: `python-backend/app/providers/fred_adapter.py`
- Test: `python-backend/tests/test_economics_routes.py`
- Reference: `src/server/economicsData.ts`
- Reference: `src/server/marketData.ts`

- [ ] **Step 1: Write failing tests for `/api/finance/economics`, `/api/finance/economics/calendar`, and `/api/finance/economics/events/{release_id}`**
- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd python-backend && pytest tests/test_economics_routes.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement the minimal Python economics service**

Rules:
- Keep schedule/snapshot wording honest.
- Preserve `status` semantics.
- Reuse FRED-backed parsing logic conceptually; do not regress the release-detail drill-through behavior.
- If `FinanceToolkit` economics helpers are adopted, confine them to clearly non-live/snapshot use cases.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd python-backend && pytest tests/test_economics_routes.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-backend/app/services/economics_service.py python-backend/app/providers/fred_adapter.py python-backend/app/api/routes/economics.py python-backend/tests/test_economics_routes.py
git commit -m "feat: add python economics routes"
```

### Task 7: Implement portfolio analytics using Python analytics services

**Files:**
- Create: `python-backend/app/providers/financetoolkit_adapter.py`
- Create: `python-backend/app/services/portfolio_service.py`
- Modify: `python-backend/app/api/routes/portfolio.py`
- Test: `python-backend/tests/test_portfolio_routes.py`
- Reference: `src/server/portfolioAnalytics.ts`
- Reference: `src/server/routes.ts`

- [ ] **Step 1: Write a failing route test for `/api/finance/portfolio-analytics`**
- [ ] **Step 2: Run the test to verify it fails**

Run: `cd python-backend && pytest tests/test_portfolio_routes.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement the minimal analytics service**

Rules:
- Preserve the current request body shape.
- Start by matching current output parity, even if the first Python version still uses the same historical close-series math as the Node implementation.
- Only use `FinanceToolkit` where it improves the implementation without changing the API contract unexpectedly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd python-backend && pytest tests/test_portfolio_routes.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-backend/app/providers/financetoolkit_adapter.py python-backend/app/services/portfolio_service.py python-backend/app/api/routes/portfolio.py python-backend/tests/test_portfolio_routes.py
git commit -m "feat: add python portfolio analytics route"
```

---

## Chunk 4: Migrate the current-market-data and news routes carefully

### Task 8: Implement current-market-data and derived overview routes in Python with provider parity

**Files:**
- Modify: `python-backend/app/providers/current_market_data_adapter.py`
- Modify: `python-backend/app/services/market_data_service.py`
- Modify: `python-backend/app/api/routes/quotes.py`
- Test: `python-backend/tests/test_quotes_routes.py`
- Reference: `src/server/marketData.ts`
- Reference: `src/server/dataStatus.ts`

- [ ] **Step 1: Write failing parity tests for `/api/finance/quotes`, `/api/finance/tick`, `/api/finance/ohlcv`, `/api/finance/sparklines`, `/api/finance/gainers`, `/api/finance/losers`, and `/api/finance/active`**
- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd python-backend && pytest tests/test_quotes_routes.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement the current-market-data adapter and overview derivations**

Rules:
- Keep a provider layer separate from `FinanceToolkit` and `FinanceDatabase`.
- Preserve truthful `status` metadata.
- Preserve the `OHLCVSeries` wrapper with `bars`, `status`, and `supportsIntraday`.
- Preserve intraday availability rules keyed off actual freshness/capability, not stringly provider checks.
- Retain honest fallback paths for daily/reference data.
- Implement `/api/finance/sparklines` from the same truthful market-data foundation used by quotes/charts.
- Implement `gainers`, `losers`, and `active` only as derivations over the same quote universe so the overview routes cannot drift from the main quote contract.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd python-backend && pytest tests/test_quotes_routes.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-backend/app/providers/current_market_data_adapter.py python-backend/app/services/market_data_service.py python-backend/app/api/routes/quotes.py python-backend/tests/test_quotes_routes.py
git commit -m "feat: add python quote and overview routes"
```

### Task 9: Implement news list, article, and sentiment routes in Python

**Files:**
- Create: `python-backend/app/services/news_service.py`
- Modify: `python-backend/app/api/routes/news.py`
- Test: `python-backend/tests/test_news_routes.py`
- Reference: `src/server/marketData.ts`
- Reference: `src/client/src/lib/useFinance.ts`

- [ ] **Step 1: Write failing tests for `/api/finance/news`, `/api/finance/news/read`, and `/api/finance/sentiment`**
- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd python-backend && pytest tests/test_news_routes.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement the minimal news service**

Rules:
- Preserve `source`, `feedProvider`, `publishedAt`, and `status` semantics.
- Omit optional query parameters when absent; never serialize literal `"undefined"`-style values.
- Keep article extraction failure modes truthful by falling back to known metadata/summary rather than inventing body text.
- Derive `/api/finance/sentiment` from the migrated Python news flow so sentiment cannot silently diverge from the article list it summarizes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd python-backend && pytest tests/test_news_routes.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-backend/app/services/news_service.py python-backend/app/api/routes/news.py python-backend/tests/test_news_routes.py
git commit -m "feat: add python news and sentiment routes"
```


---

## Chunk 5: Put Node in front of FastAPI and verify cutover safety

### Task 10: Add a Node finance proxy layer behind a feature flag

**Files:**
- Create: `src/server/financeProxy.ts`
- Modify: `src/server/routes.ts`
- Modify: `src/server/index.ts`
- Modify: `src/package.json`
- Test: `src/server/financeProxy.test.ts`

- [ ] **Step 1: Write failing proxy tests**

```typescript
test("finance proxy forwards quotes requests to FastAPI when enabled", async () => {
  // assert path, query string, method, and body forwarding
});

test("finance proxy falls back to local handlers when disabled", async () => {
  // assert current Node behavior remains available for rollback
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- server/financeProxy.test.ts`
Expected: FAIL because the proxy layer does not exist yet.

- [ ] **Step 3: Implement the feature-flagged proxy**

Rules:
- Add env vars such as `FINANCE_API_MODE=local|proxy` and `FINANCE_API_BASE_URL=http://127.0.0.1:8000`.
- Route only `/api/finance/*` through the proxy.
- Preserve non-finance routes in Node.
- Preserve a fast rollback path by leaving the local finance handlers callable while proxy mode bakes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- server/financeProxy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/financeProxy.ts src/server/financeProxy.test.ts src/server/routes.ts src/server/index.ts src/package.json
git commit -m "feat: add feature-flagged finance proxy"
```

### Task 11: Run end-to-end parity verification before any default cutover

**Files:**
- Modify: `docs/live/current-focus.md`
- Modify: `docs/live/progress.md`
- Modify: `docs/live/todo.md`
- Reference: `src/client/src/lib/useFinance.ts`
- Reference: `src/client/src/components/panels/*.tsx`

- [ ] **Step 1: Add or update smoke fixtures and route parity checks**

Checklist:
- `/api/finance/quotes`
- `/api/finance/tick`
- `/api/finance/ohlcv`
- `/api/finance/sparklines`
- `/api/finance/gainers`
- `/api/finance/losers`
- `/api/finance/active`
- `/api/finance/sentiment`
- `/api/finance/news`
- `/api/finance/news/read`
- `/api/finance/economics`
- `/api/finance/economics/calendar`
- `/api/finance/economics/events/:releaseId`
- `/api/finance/peers`
- `/api/finance/screener`
- `/api/finance/portfolio-analytics`

- [ ] **Step 2: Run Python verification**

Run: `cd python-backend && pytest -q`
Expected: PASS.

- [ ] **Step 3: Run Node verification**

Run: `npm test && npm run check`
Expected: PASS.

- [ ] **Step 4: Run proxy smoke verification**

Run these with FastAPI up and `FINANCE_API_MODE=proxy`:

```bash
curl "http://127.0.0.1:5000/api/finance/quotes?symbols=AAPL"
curl "http://127.0.0.1:5000/api/finance/ohlcv?symbol=AAPL&range=1D&interval=5m"
curl "http://127.0.0.1:5000/api/finance/news?symbol=AAPL"
curl "http://127.0.0.1:5000/api/finance/economics"
```

Expected: Responses preserve the current contract and truthful status metadata.

- [ ] **Step 5: Run browser smoke**

Verify in the terminal UI:
- quote panel still renders provider/freshness badges
- chart panel still respects intraday availability
- news panel still loads list + reader
- economics panel still shows snapshot/schedule distinctions

- [ ] **Step 6: Commit**

```bash
git add docs/live/current-focus.md docs/live/progress.md docs/live/todo.md
git commit -m "docs: record fastapi finance cutover progress"
```

---

## Route Migration Order

1. `screener`, `peers`
2. `economics`, `economics/calendar`, `economics/events/:releaseId`
3. `portfolio-analytics`
4. `quotes`, `tick`, `ohlcv`, `sparklines`
5. `news`, `news/read`, `sentiment`
6. `gainers`, `losers`, `active` once they can be derived from the migrated Python quote universe without regression

This order keeps the highest-risk live-market routes for after the Python service boundary, tests, and proxy are already proven.

---

## Rollback Plan

- Node retains the local finance handlers until proxy mode is proven stable.
- `FINANCE_API_MODE=local` must restore current behavior without code changes.
- Do not delete Node finance implementations until:
  - Python parity tests are green
  - Node proxy tests are green
  - route smoke passes in proxy mode
  - browser smoke passes in proxy mode
  - docs are updated with the new default mode

---

## Notes for the implementer

- `FinanceDatabase` should enrich or narrow the universe; it should not be allowed to define freshness claims.
- `FinanceToolkit` may improve analytics internals, but output parity comes first.
- If a Python provider cannot yet match the current quote/news behavior honestly, keep that route family on Node longer instead of weakening truthfulness.
- The alert monitor stays in Node for the first cut. It can continue reading `/api/finance/quotes` through the proxy boundary once quotes have migrated.

---

Plan complete and saved to `docs/superpowers/plans/2026-03-18-fastapi-finance-service-migration.md`. Ready to execute?
