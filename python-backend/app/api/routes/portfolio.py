from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["portfolio"])


@router.post("/portfolio-analytics")
def calculate_portfolio_analytics() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Portfolio analytics endpoint is not implemented yet.",
    )
