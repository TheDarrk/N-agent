"""
Neptune AI — Marketplace FastAPI Router
Implements public global discovery, price-locked 24h order creation,
on-chain USDT payment verification, and configuration mirroring.
"""

import logging
from fastapi import APIRouter, HTTPException, Query, Body, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from database.connection import normalize_wallet
from marketplace_service import (
    create_marketplace_listing,
    get_marketplace_listings,
    get_marketplace_listing_by_id,
    update_marketplace_listing,
    delete_marketplace_listing,
    create_marketplace_order,
    get_marketplace_order,
    list_buyer_orders,
    list_seller_sales,
    apply_purchased_config
)
from marketplace_verify import verify_usdt_payment

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])
logger = logging.getLogger("neptune.marketplace.api")


# Request Models
class CreateListingRequest(BaseModel):
    wallet: str
    agent_type: str
    title: str
    description: str = ""
    price_usdt: str
    payout_wallet: Optional[str] = None


class UpdateListingRequest(BaseModel):
    wallet: str
    title: Optional[str] = None
    description: Optional[str] = None
    price_usdt: Optional[str] = None
    payout_wallet: Optional[str] = None
    status: Optional[str] = None


class CreateOrderRequest(BaseModel):
    listing_id: str
    buyer_wallet: str


class VerifyOrderRequest(BaseModel):
    buyer_wallet: str
    tx_hash: str


# ─────────────────────────────────────────────────────────────────────────────
# 1. LISTINGS ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/listings")
async def publish_listing_endpoint(body: CreateListingRequest):
    """Publish a new agent configuration listing to the global marketplace."""
    logger.info("[MARKETPLACE API] publish request: wallet=%s agent=%s price=%s", body.wallet, body.agent_type, body.price_usdt)
    try:
        listing = create_marketplace_listing(
            seller_wallet=body.wallet,
            agent_type=body.agent_type,
            title=body.title,
            description=body.description,
            price_usdt=body.price_usdt,
            payout_wallet=body.payout_wallet
        )
        return {"success": True, "listing": listing}
    except ValueError as e:
        logger.warning("[MARKETPLACE API] publish rejected: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("[MARKETPLACE API] publish failed")
        raise HTTPException(status_code=500, detail=f"Failed to publish listing: {e}")


@router.get("/listings")
async def list_listings_endpoint(
    agent_type: Optional[str] = None,
    sort: str = "newest",
    limit: int = 50,
    offset: int = 0,
    seller: Optional[str] = None
):
    """
    Global discovery: Returns active agent listings for all users.
    Never exposes raw config_json.
    """
    try:
        listings = get_marketplace_listings(
            agent_type=agent_type,
            sort=sort,
            limit=limit,
            offset=offset,
            seller=seller
        )
        return {"success": True, "listings": listings, "count": len(listings)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch listings: {e}")


@router.get("/listings/{listing_id}")
async def get_listing_endpoint(listing_id: str):
    """Returns single listing card details (no config_json)."""
    listing = get_marketplace_listing_by_id(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"success": True, "listing": listing}


@router.get("/listings/{listing_id}/analytics")
async def listing_analytics_endpoint(listing_id: str):
    """Real analytics for a listing from the seller's history: agent wallet address, last 10 decisions / strategies /
    trades, last 3 research reports and counts. No keys, configs or emails; no placeholder numbers."""
    import asyncio
    from agent_metrics import get_listing_analytics
    data = await asyncio.to_thread(get_listing_analytics, listing_id)
    if not data:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"success": True, "analytics": data}


@router.patch("/listings/{listing_id}")
async def update_listing_endpoint(listing_id: str, body: UpdateListingRequest):
    """Update listing price, title, or status. Seller only."""
    try:
        updates = body.model_dump(exclude_unset=True)
        wallet = updates.pop("wallet")
        listing = update_marketplace_listing(listing_id, wallet, updates)
        return {"success": True, "listing": listing}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update listing: {e}")


@router.delete("/listings/{listing_id}")
async def delete_listing_endpoint(listing_id: str, wallet: str = Query(...)):
    """Soft delete listing (status='removed'). Seller only. Always allowed (the 24h lock only covers edits)."""
    logger.info("[MARKETPLACE API] delete request: listing=%s wallet=%s", listing_id, wallet)
    try:
        ok = delete_marketplace_listing(listing_id, wallet)
        if not ok:
            raise HTTPException(status_code=404, detail="Listing not found")
        return {"success": True, "message": "Listing removed from marketplace"}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete listing: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 2. ORDERS ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/orders")
async def create_order_endpoint(body: CreateOrderRequest):
    """
    Creates or returns active 24h order with locked price in USDT.
    Returns payee address, amount, token contract, and expiration timestamp.
    """
    try:
        order = create_marketplace_order(body.listing_id, body.buyer_wallet)
        return {
            "success": True,
            "order_id": order["order_id"],
            "pay_to": order["payout_wallet"],
            "amount_usdt": order["amount_usdt"],
            "amount_base_units": order["amount_base_units"],
            "token_contract": order["token_contract"],
            "expires_at": order["expires_at"],
            "status": order["status"]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create order: {e}")


@router.get("/orders/{order_id}")
async def get_order_endpoint(order_id: str):
    """Retrieves order payment details and status."""
    order = get_marketplace_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"success": True, "order": order}


@router.post("/orders/{order_id}/verify")
async def verify_order_endpoint(order_id: str, body: VerifyOrderRequest):
    """
    Verifies on-chain NEP-141 USDT payment transaction for the order.
    On success, atomically marks order completed and applies configuration.
    """
    order = get_marketplace_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if normalize_wallet(order["buyer_wallet"]) != normalize_wallet(body.buyer_wallet):
        raise HTTPException(status_code=403, detail="Buyer wallet does not match order.")

    if order["status"] == "completed":
        return {
            "success": True,
            "status": "completed",
            "message": "Order is already completed.",
            "tx_hash": order.get("tx_hash"),
            "apply_status": order.get("apply_status")
        }

    if order["status"] == "expired":
        raise HTTPException(status_code=400, detail="Order has expired. Please create a new order.")

    verify_result = verify_usdt_payment(order, body.tx_hash)
    return {"success": verify_result["status"] == "completed", **verify_result}


@router.post("/orders/{order_id}/apply")
async def retry_apply_order_endpoint(order_id: str, buyer_wallet: str = Body(..., embed=True)):
    """Retry applying configuration if initial apply failed."""
    order = get_marketplace_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if normalize_wallet(order["buyer_wallet"]) != normalize_wallet(buyer_wallet):
        raise HTTPException(status_code=403, detail="Unauthorized buyer wallet.")

    if order["status"] != "completed":
        raise HTTPException(status_code=400, detail="Cannot apply uncompleted order.")

    ok, msg = apply_purchased_config(order)
    return {"success": ok, "message": msg}


@router.get("/orders")
async def list_buyer_orders_endpoint(wallet: str = Query(...)):
    """Lists orders placed by the user."""
    orders = list_buyer_orders(wallet)
    return {"success": True, "orders": orders}


@router.get("/sales")
async def list_seller_sales_endpoint(wallet: str = Query(...)):
    """Lists completed sales by the seller."""
    sales = list_seller_sales(wallet)
    return {"success": True, "sales": sales}
