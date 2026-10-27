"""Raw NEAR AI transport for the single application model: GLM 5.3 Flash."""

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

import httpx


MODEL = "z-ai/glm-5.3-flash"
BASE_URL = "https://cloud-api.near.ai/v1"


@dataclass
class GLMMessage:
    content: str = ""
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    finish_reason: Optional[str] = None


def _timeout() -> float:
    raw = str(os.getenv("NEAR_AI_TIMEOUT", "300")).strip().lower()
    if raw in {"", "0", "none", "null", "-1"}:
        return 300.0
    try:
        return max(60.0, float(raw))
    except ValueError:
        return 300.0


def _wire_messages(messages: Iterable[Any]) -> List[Dict[str, str]]:
    result = []
    for message in messages:
        message_type = type(message).__name__
        role = "system" if message_type == "SystemMessage" else (
            "assistant" if message_type == "AIMessage" else "user"
        )
        content = getattr(message, "content", message)
        if not isinstance(content, str):
            content = json.dumps(content, ensure_ascii=False)
        result.append({"role": role, "content": content})
    return result


def _tool_schema(tool: Any) -> Dict[str, Any]:
    try:
        schema_model = tool.args_schema or tool.get_input_schema()
        parameters = schema_model.model_json_schema() if schema_model else {
            "type": "object", "properties": {}
        }
    except Exception:
        parameters = {"type": "object", "properties": {}}
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": getattr(tool, "description", "") or "",
            "parameters": parameters,
        },
    }


async def invoke_glm(
    messages: Iterable[Any],
    *,
    tools: Optional[List[Any]] = None,
    max_tokens: int = 8192,
    temperature: float = 0.3,
) -> GLMMessage:
    payload: Dict[str, Any] = {
        "model": MODEL,
        "messages": _wire_messages(messages),
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    if tools:
        payload["tools"] = [_tool_schema(tool) for tool in tools]

    headers = {
        "Authorization": f"Bearer {os.getenv('NEAR_AI_API_KEY') or os.getenv('OPENAI_API_KEY') or 'near-ai-default-key'}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(None, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{(os.getenv('NEAR_AI_BASE_URL') or BASE_URL).rstrip('/')}/chat/completions",
            headers=headers,
            json=payload,
        )
        if response.status_code != 200:
            raise RuntimeError(f"GLM HTTP {response.status_code}: {response.text[:300]}")
        body = response.json()

    choice = (body.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    calls = []
    for call in message.get("tool_calls") or []:
        function = call.get("function") or {}
        raw_args = function.get("arguments", "{}")
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
        except json.JSONDecodeError:
            args = {}
        calls.append({
            "id": call.get("id", ""),
            "name": function.get("name", ""),
            "args": args if isinstance(args, dict) else {},
        })

    content = message.get("content") or message.get("reasoning_content") or ""
    if not isinstance(content, str):
        content = json.dumps(content, ensure_ascii=False)
    return GLMMessage(
        content=content,
        tool_calls=calls,
        finish_reason=choice.get("finish_reason"),
    )
