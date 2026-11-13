"""
Unit tests for autonomous_agents/llm_utils.py
Tests tolerant JSON extraction, strict schema normalization, and deterministic fallbacks.
"""

import pytest
from pydantic import BaseModel, Field
from typing import List, Literal

from autonomous_agents.llm_utils import (
    extract_json,
    build_strict_schema,
    build_fallback_strategy,
    EmptyLLMResponse,
    TruncatedResponse,
    SchemaRejectedError
)
from autonomous_agents.rebalancer_agent import RebalancerStrategySchema, TokenStrategyItem


# ─── 1. EXTRACT JSON TESTS ──────────────────────────────────────────────────

def test_extract_json_plain():
    raw = '{"name": "test", "value": 42}'
    data = extract_json(raw)
    assert data == {"name": "test", "value": 42}


def test_extract_json_markdown_fence():
    raw = """Here is the portfolio strategy:
```json
{
  "strategy_name": "Bullish Trend",
  "allocations": {"NEAR": 70, "USDT": 30}
}
```
Please let me know if you want adjustments."""
    data = extract_json(raw)
    assert data["strategy_name"] == "Bullish Trend"
    assert data["allocations"]["NEAR"] == 70


def test_extract_json_with_think_block():
    raw = """<think>
Evaluating 1h and 1d momentum indicators.
BTC beta is 1.15. USDT allocation should be 20%.
</think>
{
  "regime": "BULLISH_EXPANSION",
  "confidence": 88
}"""
    data = extract_json(raw)
    assert data["regime"] == "BULLISH_EXPANSION"
    assert data["confidence"] == 88


def test_extract_json_trailing_chatter():
    raw = '{"status": "ok", "score": 95}\n\nNote: This setup is based on high volume breakout.'
    data = extract_json(raw)
    assert data["status"] == "ok"
    assert data["score"] == 95


def test_extract_json_repair_trailing_commas():
    # Trailing commas and single quotes
    raw = "{'symbol': 'NEAR', 'percentage': 50.0, 'active': true,}"
    data = extract_json(raw)
    assert data["symbol"] == "NEAR"
    assert data["percentage"] == 50.0


def test_extract_json_nan_infinity_replacement():
    raw = '{"target_price": NaN, "max_val": Infinity, "min_val": -Infinity, "valid": 10.5}'
    data = extract_json(raw)
    assert data["target_price"] is None
    assert data["max_val"] is None
    assert data["min_val"] is None
    assert data["valid"] == 10.5


def test_extract_json_empty_raises():
    with pytest.raises(EmptyLLMResponse):
        extract_json("")

    with pytest.raises(EmptyLLMResponse):
        extract_json("   \n\t  ")


def test_extract_json_length_truncation_raises():
    with pytest.raises(TruncatedResponse):
        extract_json('{"name": "unfinished_obj', finish_reason="length")


# ─── 2. STRICT SCHEMA TESTS ─────────────────────────────────────────────────

def test_build_strict_schema_rebalancer():
    strict = build_strict_schema(RebalancerStrategySchema)
    import json
    schema_str = json.dumps(strict)

    # 1. No $defs or $ref remaining
    assert "$defs" not in strict
    assert '"$ref"' not in schema_str

    # 2. Top-level strictness
    assert strict["type"] == "object"
    assert strict["additionalProperties"] is False
    assert set(strict["required"]) == set(strict["properties"].keys())

    # 3. Nested object strictness (target_allocations item)
    items_schema = strict["properties"]["target_allocations"]["items"]
    assert items_schema["type"] == "object"
    assert items_schema["additionalProperties"] is False
    assert set(items_schema["required"]) == set(items_schema["properties"].keys())

    # 4. No title fields polluting schema
    assert '"title"' not in schema_str


# ─── 3. DETERMINISTIC FALLBACK TESTS ────────────────────────────────────────

def test_build_fallback_strategy():
    fallback = build_fallback_strategy(
        selected_coins=["NEAR", "ETH", "BTC"],
        current_holdings={"NEAR": 100},
        min_stable_pct=25.0,
        cadence_days=7
    )
    assert fallback["source"] == "fallback"
    assert fallback["market_regime"] == "UNKNOWN"
    assert fallback["allocations"]["USDT"] == 25.0
    assert sum(fallback["allocations"].values()) == 100.0
    assert len(fallback["tp_sl_rules"]) == len(fallback["allocations"])
    assert any(r["symbol"] == "USDT" for r in fallback["tp_sl_rules"])
    assert any(r["symbol"] == "NEAR" for r in fallback["tp_sl_rules"])
