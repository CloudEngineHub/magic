"""Skill Candidate 搜索编排：召回、预筛选、模型选择和确定性降级。"""
from __future__ import annotations

import asyncio
import json
from collections.abc import Collection
from dataclasses import dataclass
from enum import StrEnum

from agentlang.logger import get_logger
from app.core.ai_abilities import get_skill_rerank_model_id
from app.core.context.run_interruption import await_with_interruption
from app.core.search_ranker import (
    MAX_MODEL_CANDIDATES,
    MAX_SELECTED_CANDIDATES,
    SearchCandidate,
    SearchRanker,
    SearchRankError,
)
from app.core.skill_utils.providers.base import (
    SkillCandidate,
    SkillProvider,
    SkillProviderId,
)
from app.core.skill_utils.providers.registry import get_registry
from app.core.skill_utils.providers.system_skills import SystemSkillsProvider

logger = get_logger(__name__)

__all__ = [
    "MAX_SEARCH_KEYWORD_LENGTH",
    "ProviderSearchError",
    "ProviderSearchErrorCode",
    "SearchAggregator",
    "SearchFallbackReason",
    "SearchResult",
    "SearchSelectionMode",
]

EXTERNAL_CANDIDATES_PER_KEYWORD = 10
MAX_SEARCH_KEYWORD_LENGTH = 255
_MAX_CANDIDATE_ID_LENGTH = 255
_MIN_MODEL_CANDIDATES_PER_PROVIDER = 3
_LOCAL_PROVIDERS = frozenset(
    {SkillProviderId.SYSTEM, SkillProviderId.MY_LIBRARY}
)
_EXTERNAL_PROVIDERS = frozenset(
    {
        SkillProviderId.MAGIC_MARKET,
        SkillProviderId.SKILLHUB,
        SkillProviderId.CLAWHUB,
    }
)
_SEARCHABLE_PROVIDERS = _LOCAL_PROVIDERS | _EXTERNAL_PROVIDERS
_PROVIDER_PRIORITY = {
    SkillProviderId.SYSTEM: 0,
    SkillProviderId.MY_LIBRARY: 1,
    SkillProviderId.MAGIC_MARKET: 2,
    SkillProviderId.CLAWHUB: 3,
    SkillProviderId.SKILLHUB: 3,
}


def _is_safe_candidate_id(value: str) -> bool:
    for character in value:
        codepoint = ord(character)
        if codepoint < 0x20 or codepoint == 0x7F:
            return False
        if 0xD800 <= codepoint <= 0xDFFF or codepoint in {0xFFFE, 0xFFFF}:
            return False
    return True


class ProviderSearchErrorCode(StrEnum):
    UNAVAILABLE = "unavailable"
    TIMEOUT = "timeout"
    FAILED = "failed"


class SearchFallbackReason(StrEnum):
    SELECTION_FAILED = "selection_failed"


class SearchSelectionMode(StrEnum):
    NOT_REQUIRED = "not_required"
    LLM = "llm"
    LOCAL_FALLBACK = "local_fallback"
    # 浏览模式：按稳定顺序列出，未经模型挑选
    BROWSE = "browse"


@dataclass(frozen=True, slots=True)
class ProviderSearchError:
    provider: SkillProviderId
    code: ProviderSearchErrorCode
    error_detail: str


@dataclass(frozen=True, slots=True)
class SearchResult:
    candidates: list[SkillCandidate]
    found_count: int
    candidate_count: int
    provider_errors: list[ProviderSearchError]
    selection_mode: SearchSelectionMode = SearchSelectionMode.NOT_REQUIRED
    fallback_reason: SearchFallbackReason | None = None
    fallback_detail: str | None = None
    page: int = 1
    has_more: bool = False
    # 浏览模式下因不支持无关键词列全量而跳过的来源
    browse_unsupported: tuple[SkillProviderId, ...] = ()

    @property
    def returned_count(self) -> int:
        return len(self.candidates)


@dataclass(frozen=True, slots=True)
class _ProviderSearchCall:
    provider: SkillProvider
    keyword: str
    limit: int | None


@dataclass(frozen=True, slots=True)
class _CallPlan:
    calls: list[_ProviderSearchCall]
    browse_unsupported: tuple[SkillProviderId, ...]


@dataclass(frozen=True, slots=True)
class _ProviderSelection:
    providers: list[SkillProvider]
    errors: list[ProviderSearchError]


class SearchAggregator:
    """统一编排本地全量扫描和外部关键词召回。"""

    def __init__(
        self,
        *,
        agent_name: str = "",
        excluded_skills: Collection[str] = (),
    ) -> None:
        self._system_provider = SystemSkillsProvider(
            agent_name=agent_name,
            excluded_skills=excluded_skills,
        )

    async def search_many(
        self,
        keywords: list[str],
        *,
        query: str | None = None,
        providers: list[str] | None = None,
        limit: int = 5,
        page: int = 1,
        interruption_event: asyncio.Event | None = None,
    ) -> SearchResult:
        normalized_keywords = self._normalize_keywords(keywords)
        # 无关键词即浏览模式：列出全量清单，不需要需求描述，也不做模型挑选
        is_browse = not normalized_keywords
        normalized_query = (query or "").strip()
        if not is_browse and not normalized_query:
            raise ValueError("query is required when keywords are provided")
        if limit < 1 or limit > MAX_SELECTED_CANDIDATES:
            raise ValueError(
                f"limit must be between 1 and {MAX_SELECTED_CANDIDATES}"
            )
        if page < 1:
            raise ValueError("page must be at least 1")
        if not is_browse and page > 1:
            raise ValueError("page is only supported when keywords are empty")

        selection = self._resolve_providers(providers)
        plan = self._build_calls(selection.providers, normalized_keywords)
        if not plan.calls:
            return SearchResult(
                candidates=[],
                found_count=0,
                candidate_count=0,
                provider_errors=selection.errors,
                selection_mode=(
                    SearchSelectionMode.BROWSE
                    if is_browse
                    else SearchSelectionMode.NOT_REQUIRED
                ),
                page=page,
                browse_unsupported=plan.browse_unsupported,
            )

        outputs = await await_with_interruption(
            asyncio.gather(
                *(
                    call.provider.search(call.keyword, limit=call.limit)
                    for call in plan.calls
                ),
                return_exceptions=True,
            ),
            interruption_event,
        )
        candidates, runtime_errors = self._merge_outputs(plan.calls, list(outputs))
        provider_errors = [*selection.errors, *runtime_errors]
        if is_browse:
            return self._browse_result(
                candidates=candidates,
                provider_errors=provider_errors,
                browse_unsupported=plan.browse_unsupported,
                limit=limit,
                page=page,
            )
        return await self._select_candidates(
            candidates=candidates,
            provider_errors=provider_errors,
            query=normalized_query,
            keywords=normalized_keywords,
            limit=limit,
            interruption_event=interruption_event,
        )

    @staticmethod
    def _normalize_keywords(keywords: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for value in keywords:
            keyword = value.strip()
            if len(keyword) > MAX_SEARCH_KEYWORD_LENGTH:
                raise ValueError(
                    f"keyword cannot exceed {MAX_SEARCH_KEYWORD_LENGTH} characters"
                )
            if keyword and keyword not in seen:
                seen.add(keyword)
                normalized.append(keyword)
        return normalized

    def _resolve_providers(self, requested: list[str] | None) -> _ProviderSelection:
        registry = get_registry()
        if requested is None:
            return _ProviderSelection(
                providers=[
                    self._provider_for_search(provider)
                    for provider in registry.enabled_providers()
                    if provider.id in _SEARCHABLE_PROVIDERS
                ],
                errors=[],
            )

        providers: list[SkillProvider] = []
        errors: list[ProviderSearchError] = []
        seen: set[SkillProviderId] = set()
        for value in requested:
            provider_id = SkillProviderId(value)
            if provider_id not in _SEARCHABLE_PROVIDERS:
                raise ValueError(f"provider is not searchable: {value}")
            if provider_id in seen:
                continue
            seen.add(provider_id)

            provider = registry.get(provider_id)
            if provider.enabled:
                providers.append(self._provider_for_search(provider))
            else:
                errors.append(
                    ProviderSearchError(
                        provider=provider_id,
                        code=ProviderSearchErrorCode.UNAVAILABLE,
                        error_detail="Provider is disabled",
                    )
                )
        return _ProviderSelection(providers=providers, errors=errors)

    def _provider_for_search(self, provider: SkillProvider) -> SkillProvider:
        if provider.id == SkillProviderId.SYSTEM:
            return self._system_provider
        return provider

    @staticmethod
    def _build_calls(
        providers: list[SkillProvider],
        keywords: list[str],
    ) -> _CallPlan:
        if not keywords:
            # 浏览模式只调用能无关键词列全量的来源，其余来源如实记为需要关键词
            return _CallPlan(
                calls=[
                    _ProviderSearchCall(provider=provider, keyword="", limit=None)
                    for provider in providers
                    if provider.supports_browse
                ],
                browse_unsupported=tuple(
                    provider.id
                    for provider in providers
                    if not provider.supports_browse
                ),
            )

        calls: list[_ProviderSearchCall] = []
        for provider in providers:
            if provider.id in _LOCAL_PROVIDERS:
                calls.append(
                    _ProviderSearchCall(
                        provider=provider,
                        keyword="",
                        limit=None,
                    )
                )
                continue
            for keyword in keywords:
                calls.append(
                    _ProviderSearchCall(
                        provider=provider,
                        keyword=keyword,
                        limit=EXTERNAL_CANDIDATES_PER_KEYWORD,
                    )
                )
        return _CallPlan(calls=calls, browse_unsupported=())

    @classmethod
    def _merge_outputs(
        cls,
        calls: list[_ProviderSearchCall],
        outputs: list[list[SkillCandidate] | BaseException],
    ) -> tuple[list[SkillCandidate], list[ProviderSearchError]]:
        merged: list[SkillCandidate] = []
        errors: dict[SkillProviderId, ProviderSearchError] = {}
        for call, output in zip(calls, outputs, strict=True):
            if isinstance(output, asyncio.CancelledError):
                raise output
            if isinstance(output, BaseException):
                logger.warning(
                    f"[{call.provider.id.value}] Skill search failed: {output}"
                )
                errors.setdefault(
                    call.provider.id,
                    cls._make_provider_error(call.provider.id, output),
                )
                continue
            for candidate in output:
                if cls._is_usable_candidate(call, candidate):
                    merged.append(candidate)

        unique: list[SkillCandidate] = []
        seen: set[tuple[SkillProviderId, str]] = set()
        for candidate in merged:
            key = (candidate.provider, candidate.id)
            if key in seen:
                continue
            seen.add(key)
            unique.append(candidate)
        return unique, list(errors.values())

    @staticmethod
    def _is_usable_candidate(
        call: _ProviderSearchCall,
        candidate: SkillCandidate,
    ) -> bool:
        if not isinstance(candidate, SkillCandidate):
            logger.warning(
                f"[{call.provider.id.value}] ignored invalid Candidate object"
            )
            return False
        if not isinstance(candidate.provider, SkillProviderId):
            logger.warning(
                f"[{call.provider.id.value}] ignored Candidate with invalid provider type"
            )
            return False
        if candidate.provider != call.provider.id:
            logger.warning(
                f"[{call.provider.id.value}] ignored Candidate with mismatched provider"
            )
            return False
        if (
            not isinstance(candidate.id, str)
            or not candidate.id
            or candidate.id != candidate.id.strip()
            or len(candidate.id) > _MAX_CANDIDATE_ID_LENGTH
            or not _is_safe_candidate_id(candidate.id)
        ):
            logger.warning(
                f"[{call.provider.id.value}] ignored Candidate with invalid id"
            )
            return False
        if not isinstance(candidate.name, str) or not isinstance(
            candidate.description,
            str,
        ):
            logger.warning(
                f"[{call.provider.id.value}] ignored Candidate with invalid text metadata"
            )
            return False
        if candidate.version is not None and not isinstance(candidate.version, str):
            logger.warning(
                f"[{call.provider.id.value}] ignored Candidate with invalid version"
            )
            return False
        return True

    @staticmethod
    def _make_provider_error(
        provider: SkillProviderId,
        error: BaseException,
    ) -> ProviderSearchError:
        code = (
            ProviderSearchErrorCode.TIMEOUT
            if isinstance(error, (TimeoutError, asyncio.TimeoutError))
            else ProviderSearchErrorCode.FAILED
        )
        return ProviderSearchError(
            provider=provider,
            code=code,
            error_detail=f"{type(error).__name__}: {error}",
        )

    @staticmethod
    def _candidate_match_key(
        candidate: SkillCandidate,
        keywords: list[str],
    ) -> tuple[int, int, int, int, int, str, str, str, str, str]:
        name = candidate.name.casefold()
        description = candidate.description.casefold()
        exact = 0
        prefix = 0
        name_contains = 0
        description_contains = 0
        for keyword in keywords:
            normalized = keyword.casefold()
            if name == normalized:
                exact += 1
            elif name.startswith(normalized):
                prefix += 1
            elif normalized in name:
                name_contains += 1
            elif normalized in description:
                description_contains += 1
        return (
            -exact,
            -prefix,
            -name_contains,
            -description_contains,
            _PROVIDER_PRIORITY[candidate.provider],
            name,
            candidate.id.casefold(),
            candidate.provider.value,
            candidate.name,
            candidate.id,
        )

    @classmethod
    def _prepare_model_candidates(
        cls,
        candidates: list[SkillCandidate],
        keywords: list[str],
    ) -> list[SkillCandidate]:
        ordered = sorted(
            candidates,
            key=lambda candidate: cls._candidate_match_key(candidate, keywords)
        )
        if len(ordered) <= MAX_MODEL_CANDIDATES:
            return ordered

        reserved_keys: set[tuple[SkillProviderId, str]] = set()
        provider_counts: dict[SkillProviderId, int] = {}
        for candidate in ordered:
            count = provider_counts.get(candidate.provider, 0)
            if count >= _MIN_MODEL_CANDIDATES_PER_PROVIDER:
                continue
            reserved_keys.add((candidate.provider, candidate.id))
            provider_counts[candidate.provider] = count + 1

        selected_keys = set(reserved_keys)
        for candidate in ordered:
            if len(selected_keys) >= MAX_MODEL_CANDIDATES:
                break
            selected_keys.add((candidate.provider, candidate.id))

        return [
            candidate
            for candidate in ordered
            if (candidate.provider, candidate.id) in selected_keys
        ]

    @classmethod
    def _browse_result(
        cls,
        *,
        candidates: list[SkillCandidate],
        provider_errors: list[ProviderSearchError],
        browse_unsupported: tuple[SkillProviderId, ...],
        limit: int,
        page: int,
    ) -> SearchResult:
        """按稳定顺序切出指定页，不裁剪候选集，也不经过模型挑选。

        关键词为空时 _candidate_match_key 退化为「来源优先级 → 名称 → id」，
        顺序在多次调用间稳定，翻页不会重复或漏项。
        """

        ordered = sorted(
            candidates,
            key=lambda candidate: cls._candidate_match_key(candidate, []),
        )
        start = (page - 1) * limit
        window = ordered[start:start + limit]
        return SearchResult(
            candidates=window,
            found_count=len(ordered),
            candidate_count=len(ordered),
            provider_errors=provider_errors,
            selection_mode=SearchSelectionMode.BROWSE,
            page=page,
            has_more=len(ordered) > start + len(window),
            browse_unsupported=browse_unsupported,
        )

    async def _select_candidates(
        self,
        *,
        candidates: list[SkillCandidate],
        provider_errors: list[ProviderSearchError],
        query: str,
        keywords: list[str],
        limit: int,
        interruption_event: asyncio.Event | None,
    ) -> SearchResult:
        model_candidates = self._prepare_model_candidates(candidates, keywords)
        fallback_candidates = model_candidates[:limit]
        if not model_candidates:
            return SearchResult(
                candidates=[],
                found_count=len(candidates),
                candidate_count=0,
                provider_errors=provider_errors,
            )

        model_id = get_skill_rerank_model_id()
        search_candidates = [
            SearchCandidate(
                name=candidate.name,
                description=candidate.description,
                source_info=(
                    f"source={candidate.provider.value}; "
                    f"builtin={str(candidate.provider == SkillProviderId.SYSTEM).lower()}"
                ),
            )
            for candidate in model_candidates
        ]
        effective_limit = min(limit, len(search_candidates))
        try:
            candidate_numbers = await SearchRanker().select_candidates(
                model_id=model_id,
                candidates=search_candidates,
                rules=self._build_rules(
                    query=query,
                    keywords=keywords,
                    limit=effective_limit,
                ),
                limit=effective_limit,
                interruption_event=interruption_event,
            )
        except asyncio.CancelledError:
            raise
        except SearchRankError as e:
            logger.warning(f"Skill Candidate selection failed: {e.detail}")
            return SearchResult(
                candidates=fallback_candidates,
                found_count=len(candidates),
                candidate_count=len(model_candidates),
                provider_errors=provider_errors,
                selection_mode=SearchSelectionMode.LOCAL_FALLBACK,
                fallback_reason=SearchFallbackReason.SELECTION_FAILED,
                fallback_detail=e.detail,
            )

        selected = [model_candidates[number - 1] for number in candidate_numbers]
        return SearchResult(
            candidates=selected,
            found_count=len(candidates),
            candidate_count=len(model_candidates),
            provider_errors=provider_errors,
            selection_mode=SearchSelectionMode.LLM,
        )

    @staticmethod
    def _build_rules(
        *,
        query: str,
        keywords: list[str],
        limit: int,
    ) -> list[str]:
        return [
            f"Full user request: {query}",
            f"Recall keywords: {json.dumps(keywords, ensure_ascii=False)}",
            "Use the full user request as the primary source of intent. Keywords are recall hints only.",
            "Select candidates that can materially help achieve the expected outcome and satisfy the key constraints. Do not reward keyword overlap alone.",
            "Select multiple candidates when the request requires complementary capabilities.",
            "When capability fit is comparable, prefer sources in this order: "
            "source=system, source=my_library, source=market, then external community sources.",
            f"Return at most {limit} candidate numbers in recommendation order.",
            "Return an empty candidate_numbers list when none are suitable.",
        ]
