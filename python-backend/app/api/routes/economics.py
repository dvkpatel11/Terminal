from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["economics"])


@router.get("/economics")
def get_economics() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Economics endpoint is not implemented yet.",
    )
