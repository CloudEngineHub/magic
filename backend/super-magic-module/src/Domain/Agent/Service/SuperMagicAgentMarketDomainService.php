<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\Agent\Service;

use App\Infrastructure\Core\ValueObject\Page;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentMarketEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentPlaybookEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentMarketType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query\AgentMarketQuery;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentMarketRepositoryInterface;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentPlaybookRepositoryInterface;

/**
 * Domain service for market agent read operations.
 */
class SuperMagicAgentMarketDomainService
{
    public function __construct(
        protected AgentPlaybookRepositoryInterface $agentPlaybookRepository,
        protected AgentMarketRepositoryInterface $agentMarketRepository,
    ) {
    }

    /**
     * Return a published market record by agent code.
     */
    public function getPublishedByAgentCode(string $agentCode): ?AgentMarketEntity
    {
        return $this->agentMarketRepository->findByAgentCode($agentCode);
    }

    /**
     * 锁定市场记录后再校验雇佣资格，避免协作者撤权与雇佣并发留下失效关系。
     */
    public function getPublishedByAgentCodeForUpdate(
        string $organizationCode,
        string $agentCode
    ): ?AgentMarketEntity {
        return $this->agentMarketRepository->findPublishedByAgentCodeForUpdate(
            $organizationCode,
            $agentCode
        );
    }

    /**
     * 协作者权限变化后锁定组织市场，并收口该市场来源的雇佣关系。
     */
    public function getPublishedOrganizationMarketByAgentCodeForUpdate(
        string $organizationCode,
        string $agentCode
    ): ?AgentMarketEntity {
        return $this->agentMarketRepository->findPublishedOrganizationByAgentCodeForUpdate(
            $organizationCode,
            $agentCode
        );
    }

    /**
     * 合并市场货架与协作权限的组织市场 ID，主列表只按 ID 查询。
     *
     * @return int[]
     */
    public function mergeVisibleOrganizationMarketIds(
        string $organizationCode,
        array $shelfIds,
        array $collaborativeAgentCodes
    ): array {
        $collaborativeMarketIds = $this->agentMarketRepository->findPublishedOrganizationIdsByAgentCodes(
            $organizationCode,
            $collaborativeAgentCodes
        );

        return array_values(array_unique(array_merge(
            array_map('intval', $shelfIds),
            $collaborativeMarketIds
        )));
    }

    /**
     * 市场资格只控制发现和雇佣；执行仍由 user_agents 的统一可用性校验决定。
     */
    public function isMarketDiscoverable(
        AgentMarketEntity $market,
        string $organizationCode,
        bool $shelfVisible,
        bool $hasCollaborativeOperation,
    ): bool {
        if ($market->getMarketType() === AgentMarketType::MARKET) {
            return true;
        }
        if ($market->getMarketType() !== AgentMarketType::ORGANIZATION
            || $market->getOrganizationCode() !== $organizationCode
            || $market->getId() === null) {
            return false;
        }

        return $shelfVisible || $hasCollaborativeOperation;
    }

    public function getById(int $id): ?AgentMarketEntity
    {
        return $this->agentMarketRepository->findById($id);
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
        return $this->agentMarketRepository->queries($query, $page);
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
        return $this->agentMarketRepository->queryAdminMarkets(
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
    public function updateInfoById(int $id, array $payload): bool
    {
        return $this->agentMarketRepository->updateInfoById($id, $payload);
    }
}
