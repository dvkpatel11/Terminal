from app.models.common import DataStatus
from app.models.economics import EconomicCalendarEvent, EconomicEventDetail, EconomicsSnapshot
from app.models.news import NewsArticle, NewsItem
from app.models.portfolio import PortfolioAnalyticsRequest, PortfolioAnalyticsResponse
from app.models.quotes import OHLCVSeries, Quote


def test_quote_model_exposes_status_fields() -> None:
    quote = Quote.model_validate(
        {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "price": 100,
            "change": 1,
            "changePercent": 1,
            "volume": 1000,
            "marketCap": 3_000_000_000_000,
            "pe": 30,
            "eps": 6.7,
            "high52": 210,
            "low52": 150,
            "open": 99,
            "previousClose": 99,
            "dayHigh": 101,
            "dayLow": 98,
            "avgVolume": 900,
            "exchange": "NASDAQ",
            "sector": "Technology",
            "quoteSource": "Yahoo Finance",
            "isLive": True,
            "status": {
                "provider": "Yahoo Finance",
                "freshness": "current",
                "asOf": "2026-03-18T12:00:00Z",
                "delayLabel": "Current session",
                "isFallback": False,
            },
        }
    )

    assert quote.status == DataStatus(
        provider="Yahoo Finance",
        freshness="current",
        asOf="2026-03-18T12:00:00Z",
        delayLabel="Current session",
        isFallback=False,
    )
    assert quote.model_dump()["status"]["freshness"] == "current"


def test_ohlcv_news_models_match_existing_client_contract() -> None:
    series = OHLCVSeries.model_validate(
        {
            "bars": [
                {
                    "date": "2026-03-18T09:30:00Z",
                    "open": 100,
                    "high": 101,
                    "low": 99,
                    "close": 100.5,
                    "volume": 1250,
                }
            ],
            "status": {
                "provider": "Polygon",
                "freshness": "delayed",
                "asOf": "2026-03-18T09:35:00Z",
                "delayLabel": "Delayed feed",
                "isFallback": False,
            },
            "supportsIntraday": True,
        }
    )
    item = NewsItem.model_validate(
        {
            "title": "Apple launches new products",
            "summary": "Launch recap",
            "url": "https://example.com/apple",
            "source": "Reuters",
            "feedProvider": "NewsAPI",
            "publishedAt": "2026-03-18T11:00:00Z",
            "sentiment": "positive",
            "status": {
                "provider": "NewsAPI",
                "freshness": "feed",
                "asOf": "2026-03-18T11:00:00Z",
                "delayLabel": "Feed-based publication metadata",
                "isFallback": False,
            },
        }
    )
    article = NewsArticle.model_validate(
        {
            "title": "Apple launches new products",
            "source": "Reuters",
            "feedProvider": "NewsAPI",
            "url": "https://example.com/apple",
            "publishedAt": "2026-03-18T11:00:00Z",
            "excerpt": "Launch recap",
            "content": ["Paragraph 1", "Paragraph 2"],
            "status": {
                "provider": "NewsAPI",
                "freshness": "feed",
                "asOf": "2026-03-18T11:00:00Z",
                "delayLabel": "Feed-based publication metadata",
                "isFallback": False,
            },
        }
    )

    assert series.supportsIntraday is True
    assert item.sentiment == "positive"
    assert article.content == ["Paragraph 1", "Paragraph 2"]


def test_economics_models_cover_snapshot_calendar_and_detail_shapes() -> None:
    snapshot = EconomicsSnapshot.model_validate(
        {
            "gdp": {"value": 2.8, "prev": 2.6, "label": "GDP", "unit": "%"},
            "cpi": {"value": 3.1, "prev": 3.2, "label": "CPI", "unit": "%"},
            "unemployment": {"value": 4.0, "prev": 4.1, "label": "Unemployment", "unit": "%"},
            "fedFunds": {"value": 4.5, "prev": 4.5, "label": "Fed Funds", "unit": "%"},
            "t10y": {"value": 4.2, "prev": 4.1, "label": "10Y Treasury", "unit": "%"},
            "t2y": {"value": 4.0, "prev": 3.9, "label": "2Y Treasury", "unit": "%"},
            "t30y": {"value": 4.4, "prev": 4.3, "label": "30Y Treasury", "unit": "%"},
            "dolllarIndex": {"value": 104.5, "prev": 104.0, "label": "USD Index (DXY)", "unit": ""},
            "eurUsd": {"value": 1.09, "prev": 1.08, "label": "EUR/USD", "unit": ""},
            "gbpUsd": {"value": 1.28, "prev": 1.27, "label": "GBP/USD", "unit": ""},
            "usdJpy": {"value": 149.2, "prev": 148.8, "label": "USD/JPY", "unit": ""},
            "gold": {"value": 2180, "prev": 2175, "label": "Gold", "unit": ""},
            "oil": {"value": 81.4, "prev": 80.1, "label": "Oil", "unit": ""},
            "status": {
                "provider": "FinanceToolkit",
                "freshness": "snapshot",
                "asOf": "2026-03-18T12:00:00Z",
                "delayLabel": "Snapshot / mixed-source view",
                "isFallback": False,
            },
        }
    )
    event = EconomicCalendarEvent.model_validate(
        {
            "id": "10:2026-03-18:7:30 AM CT",
            "releaseId": 10,
            "title": "Consumer Price Index",
            "category": "inflation",
            "importance": "high",
            "date": "2026-03-18",
            "timeCt": "7:30 AM CT",
            "releaseUrl": "https://fred.stlouisfed.org/release?rid=10",
            "status": {
                "provider": "FRED",
                "freshness": "schedule",
                "asOf": None,
                "delayLabel": "Scheduled release calendar",
                "isFallback": False,
            },
        }
    )
    detail = EconomicEventDetail.model_validate(
        {
            "releaseId": 10,
            "title": "Consumer Price Index",
            "category": "inflation",
            "importance": "high",
            "sourceName": "U.S. Bureau of Labor Statistics",
            "sourceUrl": "https://www.bls.gov/cpi/",
            "releaseCalendarUrl": "https://fred.stlouisfed.org/releases/calendar",
            "releaseWebsiteUrl": None,
            "tables": [
                {
                    "title": "Consumer Price Index",
                    "url": "https://fred.stlouisfed.org/release/tables?rid=10",
                    "recordCount": 12,
                }
            ],
            "upcomingDates": [{"date": "2026-04-10", "timeCt": "7:30 AM CT"}],
            "status": {
                "provider": "FRED",
                "freshness": "schedule",
                "asOf": None,
                "delayLabel": "Scheduled release calendar",
                "isFallback": False,
            },
        }
    )

    assert snapshot.dolllarIndex.label == "USD Index (DXY)"
    assert event.timeCt == "7:30 AM CT"
    assert detail.upcomingDates[0].timeCt == "7:30 AM CT"


def test_portfolio_models_wrap_request_positions_and_response_metrics() -> None:
    request = PortfolioAnalyticsRequest.model_validate(
        {
            "positions": [
                {"symbol": "AAPL", "shares": 50, "avgCost": 185.2},
                {"symbol": "MSFT", "shares": 25, "avgCost": 380.4},
            ]
        }
    )
    response = PortfolioAnalyticsResponse.model_validate(
        {
            "benchmarkSymbol": "SPY",
            "portfolioReturnPct": 5.0,
            "benchmarkReturnPct": 4.0,
            "activeReturnPct": 1.0,
            "beta": 1.1,
            "annualizedVolatilityPct": 18.5,
            "maxDrawdownPct": -7.2,
            "chart": [
                {"date": "2026-03-17", "portfolio": 100, "benchmark": 100},
                {"date": "2026-03-18", "portfolio": 105, "benchmark": 104},
            ],
        }
    )

    assert len(request.positions) == 2
    assert request.positions[0].avgCost == 185.2
    assert response.chart[-1].portfolio == 105
