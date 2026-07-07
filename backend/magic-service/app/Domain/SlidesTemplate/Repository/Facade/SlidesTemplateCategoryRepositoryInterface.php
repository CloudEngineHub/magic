<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Repository\Facade;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateCategoryQuery;
use App\Infrastructure\Core\ValueObject\Page;

interface SlidesTemplateCategoryRepositoryInterface
{
    public function findById(SlidesTemplateDataIsolation $dataIsolation, int|string $id): ?SlidesTemplateCategoryEntity;

    public function findByCode(SlidesTemplateDataIsolation $dataIsolation, string $code): ?SlidesTemplateCategoryEntity;

    /**
     * @param string[] $codes
     * @return SlidesTemplateCategoryEntity[]
     */
    public function findByCodes(SlidesTemplateDataIsolation $dataIsolation, array $codes): array;

    public function existsByCode(string $code): bool;

    /**
     * @return array{total: int, list: SlidesTemplateCategoryEntity[]}
     */
    public function queries(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryQuery $query, Page $page): array;

    /**
     * @return array{total: int, list: SlidesTemplateCategoryEntity[]}
     */
    public function queriesWithTemplateCount(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryQuery $query, Page $page): array;

    public function save(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryEntity $entity): SlidesTemplateCategoryEntity;

    public function updateStatus(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $status, string $updatedUid): bool;

    public function updateSort(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $sort, string $updatedUid): bool;

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): bool;
}
