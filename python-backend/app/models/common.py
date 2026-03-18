from typing import Literal

from pydantic import BaseModel, ConfigDict

DataFreshness = Literal[
    "current",
    "delayed",
    "daily",
    "reference",
    "feed",
    "schedule",
    "snapshot",
]


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DataStatus(ContractModel):
    provider: str
    freshness: DataFreshness
    asOf: str | None
    delayLabel: str
    isFallback: bool
