"""Validate JSON repair candidates before they are allowed to reach a tool."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass

from agentlang.llms.factory import LLMFactory
from agentlang.llms.processors.processor_config import ProcessorConfig
from agentlang.logger import get_logger
from app.core.ai_abilities import AIAbility, get_ability_config
from app.core.context.run_interruption import await_with_interruption

logger = get_logger(__name__)

JSON_REPAIR_VALID_FLAG = "JSON_REPAIR_VALID"


@dataclass(frozen=True)
class JsonRepairValidationResult:
    valid: bool
    advice: str


class ToolArgumentJsonRepairValidationService:
    """Use a dedicated ability to validate a repaired tool argument payload."""

    async def validate(
        self,
        *,
        tool_name: str,
        original_arguments: str,
        repaired_arguments: str,
        tool_schema: dict[str, object],
        interruption_event: asyncio.Event | None,
    ) -> JsonRepairValidationResult:
        enabled = bool(get_ability_config(AIAbility.JSON_REPAIR_VALIDATION, "enabled", True))
        if not enabled:
            return JsonRepairValidationResult(False, "The repaired JSON could not be validated.")

        model_id = str(
            get_ability_config(
                AIAbility.JSON_REPAIR_VALIDATION,
                "model_id",
                "deepseek-v4-flash",
            )
        )
        max_advice_words = int(
            get_ability_config(AIAbility.JSON_REPAIR_VALIDATION, "max_advice_words", 50)
        )
        payload = self._build_payload(
            tool_name=tool_name,
            original_arguments=original_arguments,
            repaired_arguments=repaired_arguments,
            tool_schema=tool_schema,
        )
        messages = [
            {
                "role": "system",
                "content": (
                    "Validate a candidate repair of a tool call JSON argument. "
                    f"Reply with exactly {JSON_REPAIR_VALID_FLAG} only when the repaired JSON "
                    "is valid for the supplied tool schema and preserves the intended structure. "
                    f"Otherwise reply with one short English explanation of what is invalid, within {max_advice_words} words. "
                    "Do not output JSON, Markdown, or any additional heading."
                ),
            },
            {"role": "user", "content": payload},
        ]

        try:
            response = await await_with_interruption(
                LLMFactory.call_with_tool_support(
                    model_id=model_id,
                    messages=messages,
                    tools=None,
                    processor_config=self._build_processor_config(),
                    allow_fallback=True,
                ),
                interruption_event,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("JSON repair validation model call failed: %s", exc)
            return JsonRepairValidationResult(False, "The repaired JSON could not be validated.")

        content = ""
        if response.choices and response.choices[0].message.content:
            content = response.choices[0].message.content.strip()
        if content == JSON_REPAIR_VALID_FLAG:
            return JsonRepairValidationResult(True, "")
        advice = " ".join(content.split())
        return JsonRepairValidationResult(
            False,
            advice or "The repaired JSON is not valid for this tool's parameters.",
        )

    @staticmethod
    def _build_payload(
        *,
        tool_name: str,
        original_arguments: str,
        repaired_arguments: str,
        tool_schema: dict[str, object],
    ) -> str:
        payload = json.dumps(
            {
                "tool_name": tool_name,
                "original_arguments": original_arguments,
                "repaired_arguments": repaired_arguments,
                "tool_schema": tool_schema,
            },
            ensure_ascii=False,
            indent=2,
        )
        return payload

    @staticmethod
    def _build_processor_config() -> ProcessorConfig:
        processor_config = ProcessorConfig.create_default()
        processor_config.non_stream_timeout_seconds = int(
            get_ability_config(AIAbility.JSON_REPAIR_VALIDATION, "timeout", 30)
        )
        return processor_config


tool_argument_json_repair_validation_service = ToolArgumentJsonRepairValidationService()
