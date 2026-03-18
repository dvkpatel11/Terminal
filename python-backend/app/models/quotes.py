from app.models.common import ContractModel, DataStatus


class Quote(ContractModel):
    symbol: str
    name: str
    price: float
    change: float
    changePercent: float
    volume: float
    marketCap: float | None
    pe: float | None
    eps: float | None
    high52: float
    low52: float
    open: float
    previousClose: float
    dayHigh: float
    dayLow: float
    avgVolume: float
    exchange: str
    sector: str | None = None
    quoteSource: str
    isLive: bool
    status: DataStatus


class OHLCVBar(ContractModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class OHLCVSeries(ContractModel):
    bars: list[OHLCVBar]
    status: DataStatus
    supportsIntraday: bool
