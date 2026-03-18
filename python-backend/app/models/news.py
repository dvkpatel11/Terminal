from typing import Literal

from app.models.common import ContractModel, DataStatus

NewsSentiment = Literal["positive", "negative", "neutral"]


class NewsItem(ContractModel):
    title: str
    summary: str
    url: str
    source: str
    feedProvider: str
    publishedAt: str
    sentiment: NewsSentiment | None = None
    status: DataStatus


class NewsArticle(ContractModel):
    title: str
    source: str
    feedProvider: str
    url: str
    publishedAt: str
    excerpt: str
    content: list[str]
    status: DataStatus
