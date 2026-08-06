"""Agent 搜索候选获取与排序服务。"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from enum import StrEnum

from app.core.ai_abilities import get_agent_rerank_model_id
from app.core.context.run_interruption import await_with_interruption
from app.core.search_ranker import SearchCandidate, SearchRanker, SearchRankError
from app.infrastructure.sdk.magic_service.magic_service import MagicService
from app.infrastructure.sdk.magic_service.parameter.available_agents_parameter import AvailableAgentsParameter

RERANK_THRESHOLD = 5
KEYWORD_CANDIDATE_LIMIT = 20


class AgentSearchMode(StrEnum):
    LIST_ALL = "list_all"
    DIRECT = "direct"
    LLM_RANKED = "llm_ranked"
    KEYWORD_FALLBACK = "keyword_fallback"


@dataclass(frozen=True, slots=True)
class AgentSearchCandidate:
    code: str
    name: str
    description: str


@dataclass(frozen=True, slots=True)
class AgentSearchResult:
    candidates: list[AgentSearchCandidate]
    total_matches: int
    considered_count: int
    returned_count: int
    mode: AgentSearchMode
    truncated: bool
    fallback_reason: str | None = None
    fallback_detail: str | None = None


@dataclass(frozen=True, slots=True)
class _AgentCandidatePage:
    candidates: list[AgentSearchCandidate]
    total_matches: int


class AgentSearchService:
    """基于 Magic Service 召回结果完成 Agent 候选排序。"""

    async def search(
        self,
        *,
        sdk: MagicService,
        keywords: list[str],
        query: str | None,
        limit: int,
        interruption_event: asyncio.Event | None,
    ) -> AgentSearchResult:
        if not keywords:
            page = await self._fetch_candidates(
                sdk=sdk,
                keywords=[],
                page_size=limit,
                interruption_event=interruption_event,
            )
            return self._build_result(
                page=page,
                candidates=page.candidates[:limit],
                mode=AgentSearchMode.LIST_ALL,
            )

        page = await self._fetch_candidates(
            sdk=sdk,
            keywords=keywords,
            page_size=KEYWORD_CANDIDATE_LIMIT,
            interruption_event=interruption_event,
        )
        if not page.candidates or page.total_matches <= RERANK_THRESHOLD:
            return self._build_result(
                page=page,
                candidates=page.candidates[:limit],
                mode=AgentSearchMode.DIRECT,
            )

        return await self._rank_or_fallback(
            page=page,
            keywords=keywords,
            query=query,
            limit=limit,
            interruption_event=interruption_event,
        )

    @staticmethod
    async def _fetch_candidates(
        *,
        sdk: MagicService,
        keywords: list[str],
        page_size: int,
        interruption_event: asyncio.Event | None,
    ) -> _AgentCandidatePage:
        """读取第一页候选，并按 Agent code 保序去重。"""

        result = await await_with_interruption(
            sdk.agent.list_available_agents_async(
                AvailableAgentsParameter(
                    keywords=keywords,
                    page=1,
                    page_size=page_size,
                )
            ),
            interruption_event,
        )

        candidates: list[AgentSearchCandidate] = []
        seen_codes: set[str] = set()
        for item in result.get_agents():
            if item.code in seen_codes:
                continue
            seen_codes.add(item.code)
            candidates.append(
                AgentSearchCandidate(
                    code=item.code,
                    name=item.name,
                    description=item.description,
                )
            )

        return _AgentCandidatePage(
            candidates=candidates,
            total_matches=result.get_total(),
        )

    async def _rank_or_fallback(
        self,
        *,
        page: _AgentCandidatePage,
        keywords: list[str],
        query: str | None,
        limit: int,
        interruption_event: asyncio.Event | None,
    ) -> AgentSearchResult:
        try:
            model_id = get_agent_rerank_model_id()
            candidate_numbers = await SearchRanker().select_candidates(
                model_id=model_id,
                candidates=[
                    SearchCandidate(
                        name=candidate.name,
                        description=candidate.description,
                        source_info="source=marketplace",
                    )
                    for candidate in page.candidates
                ],
                rules=[
                    f"Full user request: {query.strip() if query else 'Not provided.'}",
                    f"Recall keywords: {json.dumps(keywords, ensure_ascii=False)}",
                    "Return every candidate number exactly once.",
                    "Order all candidate numbers from best match to worst match.",
                ],
                limit=len(page.candidates),
                interruption_event=interruption_event,
                minimum_selected=len(page.candidates),
            )
            ranked = [
                page.candidates[number - 1]
                for number in candidate_numbers
            ]
        except asyncio.CancelledError:
            raise
        except SearchRankError as error:
            return self._keyword_fallback_result(
                page=page,
                keywords=keywords,
                limit=limit,
                reason="ranking_failed",
                detail=error.detail,
            )

        return self._build_result(
            page=page,
            candidates=ranked[:limit],
            mode=AgentSearchMode.LLM_RANKED,
        )

    def _keyword_fallback_result(
        self,
        *,
        page: _AgentCandidatePage,
        keywords: list[str],
        limit: int,
        reason: str,
        detail: str,
    ) -> AgentSearchResult:
        ranked = self._rank_by_keywords(page.candidates, keywords)
        return self._build_result(
            page=page,
            candidates=ranked[:limit],
            mode=AgentSearchMode.KEYWORD_FALLBACK,
            fallback_reason=reason,
            fallback_detail=detail,
        )

    @staticmethod
    def _rank_by_keywords(
        candidates: list[AgentSearchCandidate],
        keywords: list[str],
    ) -> list[AgentSearchCandidate]:
        """按稳定的本地关键词规则排序，同分保持召回顺序。"""

        normalized_keywords: list[str] = []
        for keyword in keywords:
            normalized = keyword.strip().casefold()
            if normalized:
                normalized_keywords.append(normalized)

        def match_level(candidate: AgentSearchCandidate) -> int:
            normalized_name = candidate.name.casefold()
            normalized_description = candidate.description.casefold()
            total = 0
            for keyword in normalized_keywords:
                if normalized_name == keyword:
                    total += 5
                elif normalized_name.startswith(keyword):
                    total += 3
                elif keyword in normalized_name:
                    total += 2
                elif keyword in normalized_description:
                    total += 1
            return total

        return sorted(candidates, key=match_level, reverse=True)

    @staticmethod
    def _build_result(
        *,
        page: _AgentCandidatePage,
        candidates: list[AgentSearchCandidate],
        mode: AgentSearchMode,
        fallback_reason: str | None = None,
        fallback_detail: str | None = None,
    ) -> AgentSearchResult:
        returned_count = len(candidates)
        return AgentSearchResult(
            candidates=candidates,
            total_matches=page.total_matches,
            considered_count=len(page.candidates),
            returned_count=returned_count,
            mode=mode,
            truncated=page.total_matches > returned_count,
            fallback_reason=fallback_reason,
            fallback_detail=fallback_detail,
        )
