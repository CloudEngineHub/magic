"""ask_user 工具：向用户提问并暂停当前 Agent 轮次。"""

import json
import time
from typing import Any, Dict, List, Optional, Tuple

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import (
    AskUserQuestionContent,
    AskUserResultContent,
    DisplayType,
    ToolDetail,
)
from app.core.context.execution_source import (
    SuperMagicExecutionSource,
    is_ask_user_allowed_source,
)
from app.tools.core.base_tool_params import BaseToolParams
from app.tools.core.base_user_tool_call_tool import BaseUserToolCallTool, ResultBuilder, TimeoutAnswerBuilder
from app.tools.core.tool_decorator import tool

logger = get_logger(__name__)

# Python 侧内部超时（秒），与 PHP 侧 Redis TTL=3600s 配合
ASK_USER_TIMEOUT_MIN_SECONDS = 10 * 60
ASK_USER_TIMEOUT_MAX_SECONDS = 30 * 60
ASK_USER_TIMEOUT_DEFAULT_SECONDS = 10 * 60
ASK_USER_POLICY_SKIP_SECONDS = 1

class AskUserParams(BaseToolParams):
    questions: str = Field(
        description="""<!--zh: 用 XML 格式描述要问用户的问题。支持 type: confirm / input / select / multi_select。每个问题用 <question> 标签包裹。-->
Questions in XML format. Wrap each question in a <question> tag with a `type` attribute (confirm / input / select / multi_select). For select/multi_select, add <option> children. Optional attributes: default, placeholder, min, max.""",
    )
    timeout: int = Field(
        default=ASK_USER_TIMEOUT_DEFAULT_SECONDS,
        description="""<!--zh: 等待用户回答的超时秒数（600~1800，即 10~30 分钟）。根据问题复杂程度自行判断：简单确认填 600，需要用户思考或输入内容填 900~1200，涉及复杂决策或需要用户查阅资料填 1200~1800。-->
How many seconds to wait for the user's answer (600–1800, i.e. 10–30 minutes). Choose based on the complexity of the question: 600 for simple confirmations, 900–1200 when the user needs to think or type content, 1200–1800 for complex decisions or when the user may need to look something up.""",
    )


@tool()
class AskUserTool(BaseUserToolCallTool[AskUserParams]):
    """<!--zh
    向用户提问并等待回答。用于获取缺失信息、让用户做选择、或在执行高危操作前取得用户确认。
    只有主 Agent 可以调用；如果你是被其他 Agent 调用的，不要使用此工具。
    -->
    Ask the user questions and wait for their answer. Use this to gather missing information, let the user choose between options, or get explicit confirmation before performing risky operations.
    Only the main agent can call this tool; if you were invoked by another agent, do not use it.
    """

    def get_prompt_hint(self) -> str:
        return """\
<!--zh
何时调用 ask_user：
- 缺少无法合理推断的关键信息（目标路径、凭据、格式偏好等）
- 需要用户在多个可行方案间做方向选择
- 即将执行不可逆操作，需要用户明确确认（见下方高危规则）
- 任务范围模糊，不澄清就可能做错

高危操作确认规则（即使用户已模糊表达意图也必须遵守）：
1. 删除文件/目录——列出完整待删清单，每项附简短说明（文件名、用途、大小），用日常语言概括总体影响，然后 confirm
2. 批量覆盖/重命名——列出变更前后对照表，confirm
3. shell 中带删除语义的命令（rm、find -delete 等）——先 dry-run 列出受影响文件，用日常语言向用户解释结果，confirm 后再执行
4. 发送消息、调用外部 API 等不可撤回操作——说明将发送的内容和目标，confirm
5. 修改系统配置、环境变量、定时任务——说明变更内容和可能影响，confirm

问题撰写要求（适用于所有类型的提问）：
- 假设用户不懂技术，使用日常语言，不要只贴命令或裸路径
- 文件相关操作：列出文件名 + 简短说明（这个文件是什么），而不是只有路径
- 说明影响范围和后果（涉及多少文件、会不会丢数据、能否恢复）
- 数量多（>10 项）时先给一句话汇总，再列明细
- 选项式提问（select/multi_select）时，每个选项附一句描述帮助用户理解区别

交互类型选择优先级：
- 优先使用 confirm / select / multi_select，让用户通过点击完成回答，减少打字
- 是/否、继续/取消、允许/不允许这类问题，使用 confirm，不要使用 input
- 如果可以列出 2~8 个常见答案，使用 select；即使不确定是否覆盖全部情况，也使用 select，因为系统会自动追加"其他"自由输入选项
- 如果用户可能同时需要多个答案，使用 multi_select，并设置合理的 min/max
- 只有当答案必须是用户自定义文本，且无法合理提供候选项时，才使用 input
- 路径、文件名、项目名、账号、密钥、自然语言要求等确实需要用户精确填写的信息，才使用 input
- 当用户需要回答某个具体问题时，question 是要回答的问题，option 是这个问题的候选答案；不要把多个不同问题放进 option 让用户选择要回答哪个问题

不应调用：
- 可用合理默认值的偏好问题
- 用户已在上文提供过的信息
- 被其他 Agent 调用时（此时应自行判断或将未决信息写入返回结果）
- 用户消息来自 IM 渠道时，此类渠道无法展示交互式问题，应自行判断或在回复中说明需要哪些信息

questions 参数的 XML 格式示例：

<question type="confirm">删除这 5 个临时文件？(共 2.1 MB，仅工作区)</question>

<question type="select">
你偏好哪种输出格式？
<option>PDF — 最适合分享和打印</option>
<option>Markdown — 方便后续编辑</option>
</question>

<question type="input" placeholder="例如 my-project">项目名称？</question>

<question type="multi_select" min="1" max="3">
要启用哪些功能：
<option>身份认证</option>
<option>数据库</option>
<option>API 网关</option>
</question>

支持的类型：confirm、input、select、multi_select。
select/multi_select 会自动追加一个"其他"自由输入选项。
可用 default 属性设置超时或用户跳过时的回退值。
-->
When to call ask_user:
- Must-know information that cannot be reasonably inferred (target path, credentials, format preference, etc.)
- A directional decision where multiple valid approaches exist
- About to perform an irreversible action that needs explicit user confirmation (see destructive-op rules below)
- Task scope is ambiguous enough that proceeding without clarification risks wasted effort

Destructive / irreversible operation rules (MUST confirm even when the user casually asked for it):
1. File/directory deletion — list every file with a brief description (name, purpose, size), summarize overall impact in plain language, then confirm.
2. Batch overwrite/rename — show a before-vs-after comparison table, then confirm.
3. Shell commands with delete semantics (rm, find -delete, etc.) — dry-run first to list affected files, explain the result in plain language, then confirm before executing.
4. Sending messages or calling external APIs (non-reversible) — describe what will be sent and to where, then confirm.
5. Changing system config, env vars, or cron jobs — explain the change and potential impact, then confirm.

How to write good questions (applies to ALL question types, not only destructive confirmations):
- Assume the user may not be technical. Use everyday language; do not paste raw commands or bare paths.
- For file operations, show filename + brief explanation of what the file is, not just a path.
- State scope and consequences: how many items are affected, will data be lost, is it reversible.
- For large sets (>10 items), give a one-line summary first, then the detailed list.
- For select/multi_select, add a short description to each option to help the user tell them apart.

Interaction type priority:
- Prefer confirm / select / multi_select so the user can answer by clicking with minimal typing.
- Use confirm for yes/no, continue/cancel, allow/deny questions; do not use input for these.
- If you can list 2-8 common answers, use select. Use select even when the list may not cover every case, because the system auto-appends an "Other" free-input option.
- If the user may need more than one answer, use multi_select with reasonable min/max limits.
- Only use input when the answer must be custom free text and no useful candidate options can be provided.
- Use input for exact custom values such as paths, filenames, project names, accounts, secrets, or natural-language requirements that the user must write precisely.
- When the user needs to answer a specific question, the question text is the question to answer and option elements are candidate answers to that question; do not put multiple different questions in option elements for the user to choose which question to answer.

Do NOT call when:
- A sensible default exists and the choice is a trivial preference
- The user already provided the information in this conversation
- You were invoked by another agent (use your best judgment or surface unresolved info in your result instead)
- The user message comes from an IM channel; these channels cannot render interactive questions — use your best judgment or state what information you need in your reply instead

XML format for the `questions` parameter:

```
<question type="confirm">Delete these 5 temporary files? (total 2.1 MB, workspace only)</question>

<question type="select">
Which output format do you prefer?
<option>PDF — best for sharing and printing</option>
<option>Markdown — easy to edit later</option>
</question>

<question type="input" placeholder="e.g. my-project">Project name?</question>

<question type="multi_select" min="1" max="3">
Features to enable:
<option>Auth</option>
<option>Database</option>
<option>API gateway</option>
</question>
```

Allowed types: confirm, input, select, multi_select.
For select/multi_select, the system auto-appends an "Other" free-input option.
Use the `default` attribute to set a fallback when the user times out or skips.
"""

    user_tool_call_timeout = ASK_USER_TIMEOUT_DEFAULT_SECONDS

    async def _prepare(self, tool_context: ToolContext) -> None:
        """Parse questions XML and store for BEFORE_TOOL_CALL card and execute."""
        from app.tools.ask_user_parser import parse_questions_xml

        raw_xml = tool_context.arguments.get("questions", "")
        tool_context.arguments["parsed_questions"] = parse_questions_xml(raw_xml)
        tool_context.arguments["status"] = "pending"

        source = self._get_execution_source(tool_context)
        policy_blocked = not is_ask_user_allowed_source(source)
        tool_context.arguments["ask_user_policy_blocked"] = policy_blocked
        tool_context.arguments["ask_user_policy_source"] = source.value

        if policy_blocked:
            tool_context.arguments["expires_at"] = int(time.time()) + ASK_USER_POLICY_SKIP_SECONDS
            return

        # 用大模型指定的超时覆盖基类写入的默认值，限制在 [600, 1800] 秒内
        raw_timeout = tool_context.arguments.get("timeout")
        if raw_timeout is not None:
            clamped = max(
                ASK_USER_TIMEOUT_MIN_SECONDS,
                min(ASK_USER_TIMEOUT_MAX_SECONDS, int(raw_timeout)),
            )
            tool_context.arguments["expires_at"] = int(time.time()) + clamped

    @staticmethod
    def _get_execution_source(tool_context: ToolContext) -> SuperMagicExecutionSource:
        try:
            from app.core.context.agent_context import AgentContext
            agent_context: AgentContext = tool_context.get_extension_typed("agent_context", AgentContext)
            return agent_context.get_execution_source()
        except Exception:
            return SuperMagicExecutionSource.UNKNOWN

    def build_tool_data(self, tool_context: ToolContext) -> dict:
        """提取需要持久化的结构化数据。

        将 _prepare 阶段解析好的问题列表打包，服务重启后可用此数据重建回调。
        """
        return {
            "parsed_questions": tool_context.arguments.get("parsed_questions", []),
            "policy_blocked": bool(tool_context.arguments.get("ask_user_policy_blocked", False)),
            "policy_source": tool_context.arguments.get(
                "ask_user_policy_source",
                SuperMagicExecutionSource.UNKNOWN.value,
            ),
        }

    def build_result_builder(self, tool_data: dict) -> ResultBuilder:
        """返回将用户回答转为模型上下文的闭包。

        闭包捕获当前问题列表，将 response_status 和 answer_json 转换为
        自然语言段落（content）和前端展示数据（extra_info）。
        """
        return build_ask_user_result_builder(
            tool_data.get("parsed_questions", []),
            policy_blocked=bool(tool_data.get("policy_blocked", False)),
            policy_source=str(tool_data.get("policy_source") or SuperMagicExecutionSource.UNKNOWN.value),
        )

    def build_timeout_answer_builder(self, tool_data: dict) -> TimeoutAnswerBuilder:
        """返回超时时构造默认答案的闭包。

        闭包遍历问题列表，取各题的 default_value 组装成 {sub_id: default} 的 JSON 字符串，
        随后交由 result_builder 按 timeout 状态处理。
        """
        return build_ask_user_timeout_answer_builder(tool_data.get("parsed_questions", []))

    def build_pending_content(self, tool_call_id: str, tool_data: dict) -> str:
        """返回等待期间写入 ToolResult.content 的提示文本。

        此文本会进入模型上下文，告知模型当前正在等待用户回答；
        同时携带 tool_call_id 供日志追踪。
        """
        n = len(tool_data.get("parsed_questions", []))
        return f"[ASK_USER:{tool_call_id}] {n} question(s) sent to user, waiting for response."

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: dict = None) -> Optional[ToolDetail]:
        """Build the AFTER_TOOL_CALL detail card from result.extra_info."""
        if not result or not result.extra_info:
            return None
        status = result.extra_info.get("status")
        answers = result.extra_info.get("answers", {})
        questions = result.extra_info.get("questions", [])
        if not status:
            return None
        question_id = tool_context.tool_call_id if tool_context else ""
        return ToolDetail(
            type=DisplayType.ASK_USER,
            data=AskUserResultContent(
                question_id=question_id,
                status=status,
                questions=questions,
                answers=answers,
            ),
        )

    async def get_before_tool_detail(self, tool_context: ToolContext, arguments: dict = None) -> ToolDetail:
        """Build the BEFORE_TOOL_CALL detail card for ask_user."""
        parsed = (arguments or {}).get("parsed_questions", [])
        return ToolDetail(
            type=DisplayType.ASK_USER,
            data=AskUserQuestionContent(
                question_id=tool_context.tool_call_id,
                questions=parsed,
                expires_at=tool_context.arguments.get("expires_at", 0),
                status="pending",
            ),
        )


# ─── ask_user 专属：结果构建与人类可读转换 ────────────────────────────────────

def build_ask_user_result_builder(
    parsed_questions: List[dict],
    policy_blocked: bool = False,
    policy_source: str = SuperMagicExecutionSource.UNKNOWN.value,
):
    """返回 ask_user 专属的 result_builder 闭包。

    result_builder(response_status, answer_json) -> (content, extra_info)
    """
    def result_builder(response_status: str, answer_json: str) -> Tuple[str, Dict[str, Any]]:
        try:
            answers: dict = json.loads(answer_json) if answer_json else {}
        except (json.JSONDecodeError, TypeError):
            answers = {}
        answers = _normalize_answer_keys(parsed_questions, answers)
        if policy_blocked:
            content = _humanize_policy_blocked(policy_source)
        else:
            content = _humanize_batch(
                questions=parsed_questions,
                response_status=response_status,
                answers=answers,
            )
        extra_info = {
            "status": response_status,
            "answers": answers,
            "questions": parsed_questions,
            "policy_blocked": policy_blocked,
            "policy_source": policy_source,
        }
        return content, extra_info

    return result_builder


def _normalize_answer_keys(parsed_questions: List[dict], answers: dict) -> dict:
    """将旧 sub_id 或重建后不匹配的答案按题目顺序归一到当前问题 ID。"""
    if not isinstance(answers, dict) or not answers or not parsed_questions:
        return answers

    current_ids = [q.get("sub_id", "") for q in parsed_questions]
    if any(sub_id and sub_id in answers for sub_id in current_ids):
        return answers

    if len(answers) != len(parsed_questions):
        return answers

    normalized = {}
    for question, answer in zip(parsed_questions, answers.values()):
        sub_id = question.get("sub_id", "")
        if not sub_id:
            return answers
        normalized[sub_id] = answer
    return normalized


def _humanize_policy_blocked(policy_source: str) -> str:
    return (
        "Ask User is unavailable because the current execution source is not an "
        f"interactive human chat (source: {policy_source}). This question was "
        "automatically skipped by system policy; do not wait for a user answer. "
        "If there is a safe default, continue with that default. If key "
        "information is missing, or if the operation is irreversible or risky "
        "(deletion, overwrite, external sending, payment, or system configuration "
        "changes), stop that step and explain what the user needs to provide in "
        "an interactive human chat."
    )


def build_ask_user_timeout_answer_builder(parsed_questions: List[dict]):
    """返回 ask_user 专属的 timeout_answer_builder 闭包。

    timeout_answer_builder() -> answer_json
    """
    def timeout_answer_builder() -> str:
        timeout_answers = {}
        for q in parsed_questions:
            sub_id = q.get("sub_id", "")
            default = q.get("default_value") or q.get("default", "")
            timeout_answers[sub_id] = default
        return json.dumps(timeout_answers, ensure_ascii=False)

    return timeout_answer_builder


def _xml_escape(text: str) -> str:
    """转义 XML 特殊字符，确保用户输入不破坏标签结构。"""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _humanize_batch(
    questions: List[dict],
    response_status: str,
    answers: dict,
) -> str:
    """将用户回答转换为 XML 结构化文本，供模型推理。

    answer 标签按 question 原始顺序一一对应（与模型发出的 questions 位置匹配），
    不重复 question 文本和 type，模型通过上下文中的 questions 获取对应关系。

    answers 格式为 {sub_id: answer_str}。
    """
    if response_status in ("timeout", "skipped"):
        lines = [f'<ask_user_result status="{response_status}">']
        has_no_default = False
        for q in questions:
            dv = q.get("default_value") or q.get("default")
            if dv is not None:
                lines.append(f"<answer>{_xml_escape(str(dv))}</answer>")
            else:
                has_no_default = True
                lines.append('<answer missing="true"/>')
        lines.append("</ask_user_result>")
        if has_no_default:
            lines.append("Some answers are missing with no default value. Decide whether to abort the related operation.")
        return "\n".join(lines)

    # answered
    lines = ['<ask_user_result status="answered">']
    for i, q in enumerate(questions):
        itype = q.get("interaction_type", "input")
        sub_id = q.get("sub_id", "")
        default = [] if itype == "multi_select" else ""
        # 优先用 sub_id（UUID，新前端）查找；找不到时 fallback 到 q-{index}（旧前端兼容格式）
        ans = answers.get(sub_id)
        if ans is None:
            ans = answers.get(f"q-{i}", default)

        if itype == "multi_select" and isinstance(ans, list):
            items = ", ".join(_xml_escape(str(a)) for a in ans)
            lines.append(f"<answer>{items}</answer>")
        else:
            lines.append(f"<answer>{_xml_escape(str(ans))}</answer>")
    lines.append("</ask_user_result>")
    return "\n".join(lines)
