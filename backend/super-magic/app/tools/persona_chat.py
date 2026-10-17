"""persona_chat：让 AI 人设以受访者身份回答主持人的问题。

访谈采用"主持人 + 受访者"双角色：主持人（persona-interviewer 子 Agent）决定问什么，
本工具对每个人设单独调用一次模型，以人设档案作为系统提示生成回答。两种角色由
独立的模型调用扮演，避免主持人"自问自答"导致回答同质化。

| persona_paths 数量 | 场景     | 行为                                         |
| 1                  | 一对一访谈 | 单个人设回答                                 |
| 2–6                | 焦点小组   | 按顺序回答，后回答的人能看到本轮前面人的发言 |

部分失败语义：例如 3 人小组中 2 人回答成功、1 人失败，保留 2 条回答并列出失败项；
ok 只在所有人设都成功回答时为 True。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.llms.factory import LLMFactory
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from agentlang.utils.token_estimator import truncate_text_by_token
from app.core.ai_abilities import AIAbility, get_ability_config
from app.core.context.run_interruption import await_with_interruption
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.core.tool_keepalive import start_tool_keep_alive, stop_tool_keep_alive
from app.tools.media_utils.constants import DISABLE_THINKING_BODY
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import async_exists, async_read_json, async_realpath

logger = get_logger(__name__)

# 与 persona-research skill 中的成本上限保持一致（单次回答默认 400、最多 800 tokens）。
DEFAULT_MAX_TOKENS = 400
MAX_TOKENS_LIMIT = 800
MIN_MAX_TOKENS = 100
MAX_PERSONAS = 6
# 只把最近的对话轮次带给受访者：访谈最多 7 轮、小组讨论每轮多人发言，40 条足以覆盖。
MAX_TRANSCRIPT_TURNS = 40
MAX_TURN_CHARS = 1500
MAX_PROFILE_TOKENS = 4000
FALLBACK_MODEL_ID = "auto"


class PersonaChatFailureReason(StrEnum):
    """失败原因分类，只用于前端展示的脱敏文案；完整错误只写入给模型的 content。"""

    PROFILE_UNAVAILABLE = "profile_unavailable"
    MODEL_ERROR = "model_error"
    EMPTY_ANSWER = "empty_answer"


INVALID_REQUEST_REASON = "invalid_request"


class PersonaChatParams(BaseToolParams):
    persona_paths: List[str] = Field(
        ...,
        min_length=1,
        max_length=MAX_PERSONAS,
        description="""<!--zh: 1–6 个人设 JSON 的工作区路径（如 personas/p_xxx_1a2b.json）；多于 1 个时为焦点小组，按列表顺序发言-->
Workspace paths of 1-6 persona JSON files (for example personas/p_xxx_1a2b.json). One path runs a one-on-one interview; 2-6 paths run a focus group where participants answer in list order.""",
    )
    question: str = Field(
        ...,
        min_length=1,
        description="""<!--zh: 主持人这一轮要说的话（问题或追问）-->
What the moderator says in this round: the question or follow-up probe.""",
    )
    transcript_path: str = Field(
        default="",
        description="""<!--zh: 可选：已有对话记录 JSON（interviews/ 或 discussions/ 下）的工作区路径，作为上下文；文件尚不存在时按首轮处理-->
Optional workspace path of the existing transcript JSON (under interviews/ or discussions/) used as conversation context. A missing file is treated as the first round.""",
    )
    max_tokens: int = Field(
        default=DEFAULT_MAX_TOKENS,
        description="""<!--zh: 每个人设回答的 token 上限，默认 400，最大 800-->
Token limit for each persona's answer. Default 400, maximum 800.""",
    )

    @field_validator("max_tokens", mode="before")
    @classmethod
    def clamp_max_tokens(cls, value: Any) -> int:
        # 超出范围时收紧到合法区间，而不是拒绝调用：上限是成本保护，不是调用错误。
        try:
            number = int(value)
        except (TypeError, ValueError):
            return DEFAULT_MAX_TOKENS
        return max(MIN_MAX_TOKENS, min(MAX_TOKENS_LIMIT, number))


@dataclass(frozen=True)
class _Persona:
    persona_id: str
    name: str
    path: str
    profile: Dict[str, Any]


@dataclass(frozen=True)
class _Answer:
    persona_id: str
    name: str
    text: str


@dataclass(frozen=True)
class _Failure:
    persona_id: str
    path: str
    reason: PersonaChatFailureReason
    error: str


class _InvalidRequest(ValueError):
    """路径越界、重复等调用参数问题，整次调用直接失败。"""


@tool()
class PersonaChat(WorkspaceTool[PersonaChatParams]):
    """<!--zh
    让 AI 人设以受访者身份回答主持人的一个问题，用于消费者研究的一对一访谈和焦点小组。
    每个人设由一次独立的模型调用扮演，回答保留人设自己的语言和口吻。工具不会写文件，调用方负责把问题和回答追加到对话记录。
    -->
    Have AI personas answer one moderator question as research participants, for one-on-one consumer interviews and focus groups.
    Each persona is played by a separate model call and answers in its own voice. The tool does not write files; the caller appends the question and answers to the transcript.
    """

    async def execute(self, tool_context: ToolContext, params: PersonaChatParams) -> ToolResult:
        try:
            persona_files = [await self._resolve_workspace_path(path) for path in params.persona_paths]
            transcript_file = (
                await self._resolve_workspace_path(params.transcript_path)
                if params.transcript_path.strip()
                else None
            )
            if len(set(persona_files)) != len(persona_files):
                raise _InvalidRequest("persona_paths contains the same persona more than once")
        except _InvalidRequest as exc:
            return ToolResult.error(
                f"Invalid persona_chat request: {exc}. Use workspace-relative paths such as personas/<persona_id>.json.",
                extra_info={"user_error_reason": INVALID_REQUEST_REASON},
            )

        personas: List[_Persona] = []
        failures: List[_Failure] = []
        for raw_path, file_path in zip(params.persona_paths, persona_files):
            loaded = await self._load_persona(raw_path, file_path)
            if isinstance(loaded, _Failure):
                failures.append(loaded)
            else:
                personas.append(loaded)

        transcript_text, transcript_note = await self._load_transcript(
            params.transcript_path, transcript_file, personas
        )
        model_id = self._model_id()
        agent_context = tool_context.get_extension("agent_context") if tool_context else None
        interruption_event = agent_context.get_interruption_event() if agent_context else None

        answers: List[_Answer] = []
        # 小组讨论多人顺序调用可能超过 60 秒，统一续期沙盒活跃时间。
        keep_alive_task = start_tool_keep_alive(tool_context)
        try:
            for persona in personas:
                try:
                    text = await await_with_interruption(
                        self._ask_persona(
                            model_id=model_id,
                            persona=persona,
                            others=[p.name for p in personas if p is not persona],
                            question=params.question,
                            transcript_text=transcript_text,
                            earlier_answers=answers,
                            max_tokens=params.max_tokens,
                        ),
                        interruption_event,
                    )
                except Exception as exc:  # CancelledError 是 BaseException，不会在这里被吞掉
                    logger.warning(f"persona_chat 人设回答失败 persona={persona.persona_id}: {exc}")
                    failures.append(
                        _Failure(persona.persona_id, persona.path, PersonaChatFailureReason.MODEL_ERROR, str(exc))
                    )
                    continue
                if not text:
                    failures.append(
                        _Failure(
                            persona.persona_id,
                            persona.path,
                            PersonaChatFailureReason.EMPTY_ANSWER,
                            "the model returned an empty answer",
                        )
                    )
                    continue
                answers.append(_Answer(persona.persona_id, persona.name, text))
        finally:
            stop_tool_keep_alive(keep_alive_task)

        return self._build_result(params, answers, failures, transcript_note)

    async def _resolve_workspace_path(self, raw_path: str) -> Path:
        """解析为工作区内的真实路径；越出工作区（含 .. 和软链接）一律拒绝。"""
        path_text = raw_path.strip()
        if not path_text:
            raise _InvalidRequest("path must not be empty")
        workspace = await async_realpath(self.base_dir)
        resolved = await async_realpath(self.resolve_path(path_text))
        if not resolved.is_relative_to(workspace):
            raise _InvalidRequest(f"path is outside the workspace: {raw_path}")
        return resolved

    async def _load_persona(self, raw_path: str, file_path: Path) -> _Persona | _Failure:
        fallback_id = file_path.stem
        try:
            profile = await async_read_json(file_path)
        except FileNotFoundError:
            return _Failure(fallback_id, raw_path, PersonaChatFailureReason.PROFILE_UNAVAILABLE, "persona file not found")
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            return _Failure(
                fallback_id, raw_path, PersonaChatFailureReason.PROFILE_UNAVAILABLE, f"persona file is not valid JSON: {exc}"
            )
        except Exception as exc:
            return _Failure(
                fallback_id, raw_path, PersonaChatFailureReason.PROFILE_UNAVAILABLE, f"persona file could not be read: {exc}"
            )
        if not isinstance(profile, dict):
            return _Failure(
                fallback_id, raw_path, PersonaChatFailureReason.PROFILE_UNAVAILABLE, "persona file must contain a JSON object"
            )
        # 读取侧宽兼容：id、name 缺失时用文件名兜底，不因缺字段拒绝回答。
        persona_id = _text(profile.get("id")) or fallback_id
        name = _text(profile.get("name")) or persona_id
        return _Persona(persona_id=persona_id, name=name, path=raw_path, profile=profile)

    async def _load_transcript(
        self, raw_path: str, file_path: Optional[Path], personas: List[_Persona]
    ) -> tuple[str, str]:
        """返回 (给受访者的对话记录文本, 给模型的说明)。文件不存在视为首轮。"""
        if file_path is None:
            return "", ""
        if not await async_exists(file_path):
            return "", f"Transcript {raw_path} does not exist yet, so the personas answered without prior context."
        try:
            transcript = await async_read_json(file_path)
        except Exception as exc:
            return "", f"Transcript {raw_path} could not be read ({exc}), so the personas answered without prior context."
        if not isinstance(transcript, dict):
            return "", f"Transcript {raw_path} is not a JSON object, so the personas answered without prior context."
        return _format_transcript(transcript, {p.persona_id: p.name for p in personas}), ""

    @staticmethod
    def _model_id() -> str:
        configured = get_ability_config(AIAbility.PERSONA_CHAT, "model_id")
        return _text(configured) or FALLBACK_MODEL_ID

    async def _ask_persona(
        self,
        *,
        model_id: str,
        persona: _Persona,
        others: List[str],
        question: str,
        transcript_text: str,
        earlier_answers: List[_Answer],
        max_tokens: int,
    ) -> str:
        llm_config = LLMFactory.get_model_config(model_id).model_copy(deep=True)
        llm_config.max_output_tokens = max_tokens
        messages = [
            {"role": "system", "content": _build_system_prompt(persona, others, max_tokens)},
            {"role": "user", "content": _build_user_prompt(persona, question, transcript_text, earlier_answers)},
        ]
        response = await LLMFactory.call_with_tool_support(
            model_id=model_id,
            messages=messages,
            tools=None,
            stop=None,
            extra_body=DISABLE_THINKING_BODY,
            llm_config=llm_config,
        )
        if not response or not response.choices:
            return ""
        return _text(response.choices[0].message.content)

    @staticmethod
    def _build_result(
        params: PersonaChatParams,
        answers: List[_Answer],
        failures: List[_Failure],
        transcript_note: str,
    ) -> ToolResult:
        total = len(params.persona_paths)
        lines = [f"Persona answers: {len(answers)} of {total} succeeded.", f"Moderator question: {params.question}"]
        if transcript_note:
            lines.append(transcript_note)
        for answer in answers:
            lines.extend(["", f"[{answer.persona_id}] {answer.name}:", answer.text])
        if failures:
            lines.extend(["", "Failed personas:"])
            lines.extend(f"- {failure.persona_id} ({failure.path}): {failure.error}" for failure in failures)
            lines.extend(
                [
                    "",
                    "Next: keep the successful answers. Fix the persona file or retry the failed personas; "
                    "if an interview cannot continue, record status=failed with the reason in its transcript.",
                ]
            )
        else:
            lines.extend(["", "Next: append the moderator question and these answers verbatim to the transcript."])

        data = {
            "answers": [{"persona_id": a.persona_id, "name": a.name, "text": a.text} for a in answers],
            "failed": [{"persona_id": f.persona_id, "path": f.path, "reason": f.reason.value} for f in failures],
        }
        return ToolResult(content="\n".join(lines), ok=not failures and bool(answers), data=data)

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] = None
    ) -> Dict:
        count = len((arguments or {}).get("persona_paths") or [])
        remark = (
            _translate("persona_chat.before_group", count=count)
            if count > 1
            else _translate("persona_chat.before_interview")
        )
        return {"tool_name": tool_name, "action": _action(), "remark": remark}

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] = None,
    ) -> Dict:
        answered = len(result.data.get("answers") or [])
        failed = len(result.data.get("failed") or [])
        if result.ok:
            remark = _translate("persona_chat.success", count=answered)
        elif answered:
            remark = _translate("persona_chat.partial", ok=answered, failed=failed)
        else:
            remark = _translate("persona_chat.error")
        return {"tool_name": tool_name, "action": _action(), "remark": remark}

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None
    ) -> Optional[ToolDetail]:
        answers = result.data.get("answers") or []
        failed = result.data.get("failed") or []
        question = _text((arguments or {}).get("question"))
        title_key = "persona_chat.detail_title" if answers else "persona_chat.detail_failed_title"
        lines = [f"# {_translate(title_key)}", ""]
        if question:
            lines.extend([f"**{_translate('persona_chat.detail_question')}**", "", f"> {question}", ""])
        for answer in answers:
            lines.extend([f"**{answer.get('name') or answer.get('persona_id')}**", "", str(answer.get("text") or ""), ""])
        if failed:
            lines.extend([f"**{_translate('persona_chat.detail_failed_list')}**", ""])
            lines.extend(f"- {item.get('persona_id')}: {_reason_text(item.get('reason'))}" for item in failed)
        if not answers and not failed:
            # 整次调用失败（如路径越界）：只展示脱敏后的原因，不展示给模型的原始错误。
            reason = (result.extra_info or {}).get("user_error_reason") or PersonaChatFailureReason.MODEL_ERROR.value
            lines.append(_reason_text(reason))
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="persona_chat.md", content="\n".join(lines).rstrip() + "\n"),
        )


# ── prompt 构建 ────────────────────────────────────────────────────────────


_PERSONA_SYSTEM_PROMPT = """\
You are taking part in a qualitative consumer research {session_kind} as the person described in the profile below. Stay in character for the whole conversation.

How to answer:
- Speak in the first person the way this person really talks: their vocabulary, tone, attitudes, habits, and life circumstances. Do not sound like an assistant, a consultant, or a marketer.
- Base the answer on the profile and on common sense about people like this. When the profile does not cover something, answer in a way that stays consistent with the persona and put "(inferred)" right after each made-up detail.
- Be true to the persona rather than agreeable: disagree, hesitate, admit you do not know, or say something does not fit you when that is what this person would do.
- Prefer concrete stories, recent situations, numbers, and trade-offs over general opinions.
- Answer only the moderator's latest message. Do not interview the moderator, narrate actions, or mention being an AI, a profile, or a simulation.
- Keep it to a natural spoken answer of at most about {word_budget} words (or Chinese characters), with no headings or bullet lists.
- Reply in the same language as the moderator's latest message.
{group_rules}
Persona profile (JSON):
{profile}"""

_GROUP_RULES = """\
- This is a focus group. Other participants: {others}. When relevant, react to what they said in this discussion: agree, push back, or add a different experience. Speak only for yourself.
"""


def _build_system_prompt(persona: _Persona, others: List[str], max_tokens: int) -> str:
    profile_text, _ = truncate_text_by_token(
        json.dumps(persona.profile, ensure_ascii=False, indent=1), MAX_PROFILE_TOKENS
    )
    return _PERSONA_SYSTEM_PROMPT.format(
        session_kind="focus group" if others else "one-on-one interview",
        word_budget=max(60, int(max_tokens * 0.6)),
        group_rules=_GROUP_RULES.format(others=", ".join(others)) if others else "",
        profile=profile_text,
    )


def _build_user_prompt(
    persona: _Persona, question: str, transcript_text: str, earlier_answers: List[_Answer]
) -> str:
    parts = [
        "Conversation so far:",
        transcript_text or "(This is the first question.)",
    ]
    if earlier_answers:
        parts.extend(["", "Answers already given to this question:"])
        parts.extend(f"{answer.name}: {answer.text}" for answer in earlier_answers)
    parts.extend(["", f"Moderator: {question}", "", f"Now answer as {persona.name}."])
    return "\n".join(parts)


def _format_transcript(transcript: Dict[str, Any], names: Dict[str, str]) -> str:
    """把访谈或讨论记录转成"说话人: 内容"文本。

    访谈记录用 rounds[].role（moderator | persona），讨论记录用 rounds[].speaker
    （moderator | persona_id），两种都兼容。
    """
    rounds = transcript.get("rounds")
    if not isinstance(rounds, list):
        return ""
    interviewee = names.get(_text(transcript.get("persona_id"))) or _text(transcript.get("persona_id")) or "Participant"
    lines = []
    for turn in rounds[-MAX_TRANSCRIPT_TURNS:]:
        if not isinstance(turn, dict):
            continue
        text = _text(turn.get("text"))
        if not text:
            continue
        speaker = _text(turn.get("speaker")) or _text(turn.get("role"))
        if speaker == "moderator":
            label = "Moderator"
        elif speaker == "persona":
            label = interviewee
        else:
            label = names.get(speaker) or speaker or "Participant"
        lines.append(f"{label}: {text[:MAX_TURN_CHARS]}")
    return "\n".join(lines)


# ── 展示辅助 ───────────────────────────────────────────────────────────────


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _translate(key: str, **kwargs: Any) -> str:
    return i18n.translate(key, category="tool.messages", **kwargs)


def _action() -> str:
    return i18n.translate("persona_chat", category="tool.actions")


def _reason_text(reason: Any) -> str:
    known = {item.value for item in PersonaChatFailureReason} | {INVALID_REQUEST_REASON}
    key = reason if reason in known else PersonaChatFailureReason.MODEL_ERROR.value
    return _translate(f"persona_chat.reason.{key}")


__all__ = ["PersonaChat", "PersonaChatParams"]
