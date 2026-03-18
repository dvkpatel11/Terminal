from fastapi import APIRouter

from app.api.routes.economics import router as economics_router
from app.api.routes.news import router as news_router
from app.api.routes.portfolio import router as portfolio_router
from app.api.routes.quotes import router as quotes_router
from app.api.routes.screener import router as screener_router
from app.core.config import get_settings

settings = get_settings()
api_router = APIRouter(prefix=settings.finance_api_prefix)
api_router.include_router(quotes_router)
api_router.include_router(news_router)
api_router.include_router(economics_router)
api_router.include_router(screener_router)
api_router.include_router(portfolio_router)
