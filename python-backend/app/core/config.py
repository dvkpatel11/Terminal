from functools import lru_cache

from pydantic import BaseModel, ConfigDict


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True)

    app_name: str = "BLMTRM Finance Service"


@lru_cache
def get_settings() -> Settings:
    return Settings()
