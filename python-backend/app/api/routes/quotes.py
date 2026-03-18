from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["quotes"])


@router.get("/quotes")
def list_quotes() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Quotes endpoint is not implemented yet.",
    )


@router.get("/sparklines")
def get_sparklines() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Sparklines endpoint is not implemented yet.",
    )
