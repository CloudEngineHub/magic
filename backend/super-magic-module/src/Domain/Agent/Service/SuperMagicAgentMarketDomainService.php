<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\Agent\Service;

use App\Infrastructure\Core\ValueObject\Page;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentMarketEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentPlaybookEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query\AgentMarketQuery;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentMarketRepositoryInterface;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentPlaybookRepositoryInterface;
use Hyperf\DbConnection\Db;

/**
 * Domain service for market agent read operations.
 */
class SuperMagicAgentMarketDomainService
{
    public function __construct(
        protected AgentPlaybookRepositoryInterface $agentPlaybookRepository,
        protected AgentMarketRepositoryInterface $agentMarketRepository,
        protected UserAgentDomainService $userAgentDomainService,
        protected SuperMagicAgentCategoryRelationDomainService $categoryRelationDomainService
    ) {
    }

    /**
     * Return a published market record by agent code.
     */
    public function getPublishedByAgentCode(string $agentCode): ?AgentMarketEntity
    {
        $agentMarket = $this->agentMarketRepository->findByAgentCode($agentCode);
        if ($agentMarket !== null) {
            $this->fillMarketCategoryIds([$agentMarket]);
        }
        return $agentMarket;
    }

    /**
     * Query the published market list.
     *
     * @param AgentMarketQuery $query Query conditions
     * @param Page $page Page request
     * @return array{total: int, list: array<AgentMarketEntity>}
     */
    public function queries(AgentMarketQuery $query, Page $page): array
    {
        $result = $this->agentMarketRepository->queries($query, $page);
        $this->fillMarketCategoryIds($result['list']);
        return $result;
    }

    /**
     * 管理后台查询员工市场列表.
     *
     * @return array{total: int, list: array<AgentMarketEntity>}
     */
    public function queryAdminMarkets(
        ?string $publishStatus,
        ?string $organizationCode,
        ?string $name18n,
        ?string $publisherType,
        ?string $agentCode,
        ?string $startTime,
        ?string $endTime,
        ?array $categoryIds,
        string $orderBy,
        Page $page
    ): array {
        $result = $this->agentMarketRepository->queryAdminMarkets(
            $publishStatus,
            $organizationCode,
            $name18n,
            $publisherType,
            $agentCode,
            $startTime,
            $endTime,
            $categoryIds,
            $orderBy,
            $page
        );
        $this->fillMarketCategoryIds($result['list']);
        return $result;
    }

    /**
     * Load playbooks in batch for the market list.
     *
     * @param int[] $agentVersionIds Agent version ids
     * @return array<int, AgentPlaybookEntity[]> Playbooks grouped by agent_version_id
     */
    public function getPlaybooksByAgentVersionIds(array $agentVersionIds): array
    {
        return $this->agentPlaybookRepository->getByAgentVersionIds($agentVersionIds);
    }

    /**
     * 更新市场员工排序值.
     */
    public function updateSortOrderById(int $id, int $sortOrder): bool
    {
        return $this->agentMarketRepository->updateSortOrderById($id, $sortOrder);
    }

    /**
     * 按传入字段部分更新市场员工信息.
     *
     * @param array{
     *     category_id?: null|int,
     *     name_i18n?: null|array,
     *     description_i18n?: null|array,
     *     role_i18n?: null|array,
     *     icon?: null|array,
     *     icon_type?: null|int,
     *     sort_order?: null|int,
     *     is_featured?: bool,
     *     is_hidden?: bool,
     *     category_ids?: int[]
     * } $payload
     */
    public function updateInfoById(SuperMagicAgentDataIsolation $dataIsolation, int $id, array $payload): bool
    {
        return Db::transaction(function () use ($dataIsolation, $id, $payload): bool {
            $updated = $this->agentMarketRepository->updateInfoById($id, $payload);
            if ($updated && array_key_exists('category_ids', $payload)) {
                $this->categoryRelationDomainService->replaceMarketCategories($dataIsolation, $id, $payload['category_ids']);
            }
            return $updated;
        });
    }

    /** @param AgentMarketEntity[] $agentMarkets */
    private function fillMarketCategoryIds(array $agentMarkets): void
    {
        $marketIds = [];
        foreach ($agentMarkets as $agentMarket) {
            if ($agentMarket->getId() !== null) {
                $marketIds[] = $agentMarket->getId();
            }
        }

        $categoryIdsMap = $this->categoryRelationDomainService->getMarketCategoryIdsMap($marketIds);
        foreach ($agentMarkets as $agentMarket) {
            $marketId = $agentMarket->getId();
            if ($marketId === null) {
                continue;
            }

            $agentMarket->setCategoryIds($categoryIdsMap[$marketId] ?? $agentMarket->getCategoryIds());
        }
    }
}
