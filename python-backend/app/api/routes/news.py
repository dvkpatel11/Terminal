from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["news"])


@router.get("/news")
def list_news() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="News endpoint is not implemented yet.",
    )
