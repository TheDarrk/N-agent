"""
Neptune AI — Resilient Structured LLM Utilities
Provides strict schema normalization, provider capability ladder (json_schema -> tool_calling -> json_object),
tolerant JSON extraction with think-tag stripping and json-repair, validation self-repair,
and deterministic fallback generation.
"""

import os
import re
import json
import copy
import logging
from typing import Type, Dict, Any, Optional, List, Tuple
from pydantic import BaseModel, ValidationError
import httpx
import json_repair

logger = logging.getLogger("llm_utils")


# ─── EXCEPTIONS WITH REASON CODES ──────────────────────────────────────────

class LLMError(Exception):
    def __init__(self, message: str, reason_code: str = "PROVIDER_ERROR"):
        super().__init__(message)
        self.reason_code = reason_code


class EmptyLLMResponse(LLMError):
    def __init__(self, message: str = "LLM returned empty output"):
        super().__init__(message, "EMPTY")


class TruncatedResponse(LLMError):
    def __init__(self, message: str = "LLM response truncated due to token length limit"):
        super().__init__(message, "TRUNCATED")


class SchemaRejectedError(LLMError):
    def __init__(self, message: str = "LLM response schema was rejected or invalid JSON"):
        super().__init__(message, "SCHEMA_REJECTED")


class ValidationLLMError(LLMError):
    def __init__(self, message: str = "LLM output failed Pydantic schema validation"):
        super().__init__(message, "VALIDATION")


# ─── SCHEMA BUILDER (TASK 2.2) ──────────────────────────────────────────────

def build_strict_schema(model_cls: Type[BaseModel]) -> Dict[str, Any]:
    """
    Builds an OpenAI/NEAR AI strict-mode compliant JSON schema.
    1. Inlines all $defs and removes $ref recursively.
    2. Removes title, default, and examples recursively.
    3. Sets additionalProperties: false and required = all properties for every object.
    4. Enforces non-optional clean schema primitives.
    """
    raw = copy.deepcopy(model_cls.model_json_schema())
    defs = raw.pop("$defs", {})

    def _resolve(node: Any) -> Any:
        if isinstance(node, dict):
            # Inline $ref references
            if "$ref" in node:
                ref_key = node["$ref"].split("/")[-1]
                if ref_key in defs:
                    resolved = copy.deepcopy(defs[ref_key])
                    return _resolve(resolved)

            cleaned: Dict[str, Any] = {}
            for k, v in node.items():
                if k in ("title", "default", "examples"):
                    continue
                cleaned[k] = _resolve(v)

            # Strict object schema rules
            if cleaned.get("type") == "object" or "properties" in cleaned:
                cleaned["type"] = "object"
                cleaned["additionalProperties"] = False
                props = cleaned.get("properties", {})
                cleaned["required"] = list(props.keys())

            # Convert anyOf null unions if present
            if "anyOf" in cleaned:
                types = []
                for sub in cleaned["anyOf"]:
                    t = sub.get("type")
                    if t:
                        types.append(t)
                if "null" in types and len(types) == 2:
                    other_type = [t for t in types if t != "null"][0]
                    cleaned.pop("anyOf", None)
                    cleaned["type"] = [other_type, "null"]

            return cleaned
        elif isinstance(node, list):
            return [_resolve(item) for item in node]
        return node

    result = _resolve(raw)
    result.pop("$defs", None)
    return result


# ─── TOLERANT JSON EXTRACTION (TASK 2.4) ───────────────────────────────────

def extract_json(raw_text: str, finish_reason: Optional[str] = None) -> Dict[str, Any]:
    """
    Extracts JSON object from raw LLM output tolerating:
    - Thinking blocks (<think>...</think>)
    - Markdown code fences (```json ... ```)
    - Preamble/trailing conversational chatter
    - Single quotes, trailing commas, missing brackets (via json-repair)
    - NaN / Infinity literals
    """
    if not raw_text or not raw_text.strip():
        raise EmptyLLMResponse("LLM returned empty response")

    text = raw_text.strip()

    # 1. Strip <think>...</think> blocks
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # 2. Strip markdown fences ```json ... ``` or ``` ... ```
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fence_match:
        text = fence_match.group(1).strip()

    # 3. Replace invalid JSON NaN / Infinity values
    text = re.sub(r"\bNaN\b", "null", text)
    text = re.sub(r"\b-?Infinity\b", "null", text)

    # 4. Check if truncated due to token length limit
    if finish_reason == "length":
        raise TruncatedResponse("LLM generation truncated mid-token (finish_reason=length)")

    # 5. Attempt direct standard JSON parse
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # 6. Extract first complete JSON object using JSONDecoder raw_decode
    start = text.find("{")
    if start != -1:
        try:
            decoder = json.JSONDecoder()
            obj, _ = decoder.raw_decode(text[start:])
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass

    # 7. Tolerant repair via json_repair (handles trailing commas, unescaped quotes, truncated tails)
    try:
        repaired = json_repair.loads(text)
        if isinstance(repaired, dict):
            return repaired
        if isinstance(repaired, list) and len(repaired) > 0 and isinstance(repaired[0], dict):
            return repaired[0]
    except Exception:
        pass

    raise SchemaRejectedError(f"Failed to parse JSON from LLM output: {raw_text[:250]}")


# ─── CAPABILITY LADDER (TASK 2.3) ──────────────────────────────────────────

# Global module state to remember which structured mode works with the provider
_WORKING_RUNG = 1  # 1 = json_schema (strict), 2 = tool calling, 3 = json_object prompt


async def call_llm_structured(
    messages: List[Dict[str, str]],
    model_cls: Type[BaseModel],
    *,
    max_tokens: int = 6000,
    retries: int = 2,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    timeout_sec: float = 180.0
) -> Tuple[BaseModel, Dict[str, Any], str]:
    """
    Executes structured LLM generation with capability probe ladder and self-repair.
    Returns (pydantic_instance, raw_dict, raw_content_str).
    """
    global _WORKING_RUNG

    api_key = api_key or os.getenv("NEAR_AI_API_KEY", "").strip()
    base_url = (base_url or os.getenv("NEAR_AI_BASE_URL", "https://cloud-api.near.ai/v1")).rstrip("/")
    model = model or os.getenv("NEAR_AI_MODEL", "z-ai/glm-5.3-flash")

    if not api_key:
        raise LLMError("NEAR_AI_API_KEY is not configured", "PROVIDER_ERROR")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    strict_schema = build_strict_schema(model_cls)
    schema_name = model_cls.__name__

    current_rung = _WORKING_RUNG
    conversation = [dict(m) for m in messages]
    current_max_tokens = max_tokens

    for attempt in range(retries + 1):
        payload: Dict[str, Any] = {
            "model": model,
            "messages": conversation,
            "temperature": 0.1 if attempt > 0 else 0.15,
            "max_tokens": current_max_tokens,
            "chat_template_kwargs": {"enable_thinking": False}
        }

        # Apply structured output according to current rung
        if current_rung == 1:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "strict": True,
                    "schema": strict_schema
                }
            }
        elif current_rung == 2:
            payload["tools"] = [{
                "type": "function",
                "function": {
                    "name": f"submit_{schema_name}",
                    "description": f"Submit verified {schema_name} structured payload",
                    "parameters": strict_schema
                }
            }]
            payload["tool_choice"] = {
                "type": "function",
                "function": {"name": f"submit_{schema_name}"}
            }
        else:  # Rung 3: json_object
            payload["response_format"] = {"type": "json_object"}
            # Ensure schema is explicitly mentioned in system prompt
            if conversation and conversation[0].get("role") == "system":
                schema_hint = f"\nReturn strictly valid JSON matching this JSON schema:\n{json.dumps(strict_schema)}"
                if schema_hint not in conversation[0]["content"]:
                    conversation[0]["content"] += schema_hint

        # Send HTTP request
        try:
            timeout_cfg = httpx.Timeout(timeout_sec, connect=10.0)
            async with httpx.AsyncClient(timeout=timeout_cfg) as client:
                resp = await client.post(
                    f"{base_url}/chat/completions",
                    headers=headers,
                    json=payload
                )

            # Check for provider rejection of structured output mode
            if resp.status_code in (400, 422):
                err_text = resp.text.lower()
                if any(k in err_text for k in ("response_format", "json_schema", "schema", "tool", "strict")):
                    logger.warning(f"[LLM_UTILS] Rung {current_rung} rejected by provider: {resp.text[:300]}. Downgrading ladder.")
                    if current_rung == 1:
                        current_rung = 2
                        _WORKING_RUNG = 2
                        continue
                    elif current_rung == 2:
                        current_rung = 3
                        _WORKING_RUNG = 3
                        continue

            if resp.status_code != 200:
                raise LLMError(f"HTTP {resp.status_code}: {resp.text[:400]}", "PROVIDER_ERROR")

            data = resp.json()

        except httpx.RequestError as req_err:
            logger.error(f"[LLM_UTILS] Request error to {base_url}: {req_err}")
            if attempt == retries:
                raise LLMError(f"Network error communicating with AI provider: {req_err}", "PROVIDER_ERROR")
            continue

        # Task 2.1: Detailed Raw Logging
        choice = (data.get("choices") or [{}])[0]
        finish_reason = choice.get("finish_reason")
        usage = data.get("usage", {})
        msg = choice.get("message", {})

        raw_content = msg.get("content") or ""
        reasoning_content = msg.get("reasoning_content") or ""

        # Extract tool calls arguments if Rung 2
        tool_calls = msg.get("tool_calls") or []
        if current_rung == 2 and tool_calls:
            first_call = tool_calls[0].get("function", {})
            raw_content = first_call.get("arguments") or raw_content

        target_text = raw_content if raw_content.strip() else reasoning_content

        logger.info(
            f"[LLM_UTILS: RAW LOG] Model: {data.get('model')} | Rung: {current_rung} | "
            f"Finish: {finish_reason} | Usage: {usage} | Len: {len(target_text)} | "
            f"ReasoningContent: {bool(reasoning_content)} | "
            f"Prefix: {repr(target_text[:250])} | Suffix: {repr(target_text[-250:])}"
        )

        # Handle Truncation
        if finish_reason == "length":
            logger.warning("[LLM_UTILS] Output truncated. Doubling max_tokens and retrying...")
            current_max_tokens = min(current_max_tokens * 2, 16000)
            conversation.append({
                "role": "user",
                "content": "Your previous response was cut off. Provide a concise, complete JSON response matching the schema."
            })
            continue

        # Extract JSON
        try:
            extracted_dict = extract_json(target_text, finish_reason=finish_reason)
        except TruncatedResponse:
            current_max_tokens = min(current_max_tokens * 2, 16000)
            continue
        except SchemaRejectedError as sre:
            logger.warning(f"[LLM_UTILS] Extraction failed on attempt {attempt}: {sre}")
            if attempt < retries:
                conversation.append({"role": "assistant", "content": target_text[:1000]})
                conversation.append({
                    "role": "user",
                    "content": "Failed to parse valid JSON from your output. Output strictly the raw JSON object without markdown or conversational commentary."
                })
                continue
            raise

        # Task 2.5: Validate and Self-Repair with Pydantic
        try:
            validated_obj = model_cls.model_validate(extracted_dict)
            _WORKING_RUNG = current_rung  # Lock working rung for future calls
            return validated_obj, extracted_dict, target_text
        except ValidationError as ve:
            logger.warning(f"[LLM_UTILS] Pydantic validation error on attempt {attempt}:\n{ve}")
            if attempt < retries:
                err_summary = str(ve)[:800]
                conversation.append({"role": "assistant", "content": json.dumps(extracted_dict)})
                conversation.append({
                    "role": "user",
                    "content": f"Your JSON failed validation:\n{err_summary}\nReturn the corrected full JSON only, matching the exact required schema."
                })
                continue
            raise ValidationLLMError(f"Validation failed after {retries} retries: {ve}")

    raise LLMError("Exhausted all retries without obtaining valid structured output", "VALIDATION")


# ─── DETERMINISTIC FALLBACK STRATEGY (TASK 2.8) ─────────────────────────────

def build_fallback_strategy(
    selected_coins: List[str],
    current_holdings: Optional[Dict[str, float]] = None,
    min_stable_pct: float = 15.0,
    cadence_days: int = 7,
    reason: str = "LLM output could not be validated; held current allocation"
) -> Dict[str, Any]:
    """
    Builds a mathematically sound deterministic fallback strategy keeping portfolio safe:
    - Enforces stablecoin floor (min_stable_pct)
    - Distributes remaining percentage proportionally across selected assets
    - Correctly aligns token_index with selected_coins
    - No TP/SL (stand aside)
    - Sets market_regime = UNKNOWN, risk_level = MODERATE
    - Marks source = fallback
    """
    # Normalize coins and ensure USDT is present at index 0 if not specified
    norm_coins = list(dict.fromkeys([c.upper().strip() for c in selected_coins if c.strip()]))
    if "USDT" not in norm_coins:
        norm_coins.insert(0, "USDT")

    clean_coins = [c for c in norm_coins if c not in ("USDT", "USDC")]
    floor = max(float(min_stable_pct), 10.0)
    floor = min(floor, 100.0)

    allocations: Dict[str, float] = {}
    tp_sl_rules: List[Dict[str, Any]] = []

    # Add stablecoin entry first
    usdt_idx = norm_coins.index("USDT")
    allocations["USDT"] = round(floor, 2)
    tp_sl_rules.append({
        "token_index": usdt_idx,
        "symbol": "USDT",
        "target_percentage": round(floor, 2),
        "tp_price_usd": 1.0,
        "sl_price_usd": 1.0,
        "action_reasoning": "Fallback USDT capital preservation buffer"
    })

    if clean_coins:
        remaining = 100.0 - floor
        each = round(remaining / len(clean_coins), 2)
        total_assigned = 0.0
        for i, sym in enumerate(clean_coins):
            # Give remainder to the last token to ensure exact 100% sum
            if i == len(clean_coins) - 1:
                token_pct = round(remaining - total_assigned, 2)
            else:
                token_pct = each
                total_assigned += each
            token_idx = norm_coins.index(sym)
            allocations[sym] = token_pct
            tp_sl_rules.append({
                "token_index": token_idx,
                "symbol": sym,
                "target_percentage": token_pct,
                "tp_price_usd": 0.0,
                "sl_price_usd": 0.0,
                "action_reasoning": reason
            })

    return {
        "strategy_name": "Defensive Fallback Capital Preservation",
        "executive_summary": f"Fallback strategy triggered ({reason}). Allocated {floor}% baseline to USDT stablecoins and held remaining capital balanced across candidate assets.",
        "market_regime": "UNKNOWN",
        "risk_level": "MODERATE",
        "rebalance_cadence_days": cadence_days,
        "allocations": allocations,
        "tp_sl_rules": tp_sl_rules,
        "source": "fallback",
        "action_reasoning": reason
    }
