from typing import Literal

from app.models.common import ContractModel, DataStatus

EconomicEventCategory = Literal[
    "inflation",
    "labor",
    "growth",
    "policy",
    "consumption",
    "activity",
    "housing",
]
EconomicEventImportance = Literal["high", "medium"]


class EconomicsSnapshotMetric(ContractModel):
    value: float
    prev: float
    label: str
    unit: str


class EconomicsSnapshot(ContractModel):
    gdp: EconomicsSnapshotMetric
    cpi: EconomicsSnapshotMetric
    unemployment: EconomicsSnapshotMetric
    fedFunds: EconomicsSnapshotMetric
    t10y: EconomicsSnapshotMetric
    t2y: EconomicsSnapshotMetric
    t30y: EconomicsSnapshotMetric
    dolllarIndex: EconomicsSnapshotMetric
    eurUsd: EconomicsSnapshotMetric
    gbpUsd: EconomicsSnapshotMetric
    usdJpy: EconomicsSnapshotMetric
    gold: EconomicsSnapshotMetric
    oil: EconomicsSnapshotMetric
    status: DataStatus


class EconomicCalendarEvent(ContractModel):
    id: str
    releaseId: int
    title: str
    category: EconomicEventCategory
    importance: EconomicEventImportance
    date: str
    timeCt: str
    releaseUrl: str
    status: DataStatus


class EconomicReleaseTable(ContractModel):
    title: str
    url: str
    recordCount: int | None


class EconomicReleaseScheduleDate(ContractModel):
    date: str
    timeCt: str


class EconomicEventDetail(ContractModel):
    releaseId: int
    title: str
    category: EconomicEventCategory
    importance: EconomicEventImportance
    sourceName: str
    sourceUrl: str | None
    releaseCalendarUrl: str
    releaseWebsiteUrl: str | None
    tables: list[EconomicReleaseTable]
    upcomingDates: list[EconomicReleaseScheduleDate]
    status: DataStatus
