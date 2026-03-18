from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["screener"])


@router.get("/screener")
def get_screener() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Screener endpoint is not implemented yet.",
    )
