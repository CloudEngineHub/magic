<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\Agent\Service;

use Dtyq\SuperMagic\Domain\Agent\Entity\AgentCategoryEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query\AgentCategoryQuery;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentCategoryRepositoryInterface;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentMarketRepositoryInterface;

class SuperMagicAgentCategoryDomainService
{
    public function __construct(
        private readonly AgentCategoryRepositoryInterface $categoryRepository,
        private readonly AgentMarketRepositoryInterface $marketRepository,
    ) {
    }

    /** @return AgentCategoryEntity[] */
    public function findAll(): array
    {
        return $this->categoryRepository->findAll();
    }

    public function findById(int $id): ?AgentCategoryEntity
    {
        return $this->categoryRepository->findById($id);
    }

    /** @return AgentCategoryEntity[] */
    public function findByIds(array $ids): array
    {
        return $this->categoryRepository->findByIds($ids);
    }

    /** @return AgentCategoryEntity[] */
    public function findByQuery(AgentCategoryQuery $query): array
    {
        return $this->categoryRepository->findByQuery($query);
    }

    public function save(AgentCategoryEntity $category): AgentCategoryEntity
    {
        return $this->categoryRepository->save($category);
    }

    public function deleteById(int $id): bool
    {
        return $this->categoryRepository->deleteById($id);
    }

    public function isReferencedByMarket(int $categoryId): bool
    {
        return $this->marketRepository->countByCategoryId($categoryId) > 0;
    }

    public function getMarketReferenceCount(int $categoryId): int
    {
        return $this->marketRepository->countByCategoryId($categoryId);
    }

    /** @param int[] $categoryIds */
    public function getMarketReferenceCounts(array $categoryIds): array
    {
        return $this->marketRepository->countByCategoryIds($categoryIds);
    }

    /** @return array<array{id:int, name_i18n:array, logo:?string, sort_order:int, status:int, crew_count:int}> */
    public function getCategoriesWithCrewCount(): array
    {
        $categories = $this->categoryRepository->findEnabled();
        $categoryIds = [];
        foreach ($categories as $category) {
            if ($category->getId() !== null) {
                $categoryIds[] = $category->getId();
            }
        }

        $crewCounts = $this->marketRepository->countPublishedByCategoryIds($categoryIds);
        $result = [];
        foreach ($categories as $category) {
            $categoryId = $category->getId();
            $crewCount = $crewCounts[$categoryId] ?? 0;
            if ($crewCount === 0) {
                continue;
            }

            $result[] = [
                'id' => $categoryId,
                'name_i18n' => $category->getNameI18n(),
                'logo' => $category->getLogo(),
                'sort_order' => $category->getSortOrder(),
                'status' => $category->getStatus(),
                'crew_count' => $crewCount,
            ];
        }

        return $result;
    }
}
