from app.models.common import ContractModel


class PortfolioPositionInput(ContractModel):
    symbol: str
    shares: float
    avgCost: float


class PortfolioAnalyticsRequest(ContractModel):
    positions: list[PortfolioPositionInput]


class PortfolioChartPoint(ContractModel):
    date: str
    portfolio: float
    benchmark: float


class PortfolioAnalyticsResponse(ContractModel):
    benchmarkSymbol: str
    portfolioReturnPct: float | None
    benchmarkReturnPct: float | None
    activeReturnPct: float | None
    beta: float | None
    annualizedVolatilityPct: float | None
    maxDrawdownPct: float | None
    chart: list[PortfolioChartPoint]
