<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Repository\Facade;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateTagEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateTagQuery;
use App\Infrastructure\Core\ValueObject\Page;

interface SlidesTemplateTagRepositoryInterface
{
    public function findById(SlidesTemplateDataIsolation $dataIsolation, int|string $id): ?SlidesTemplateTagEntity;

    public function findByCode(SlidesTemplateDataIsolation $dataIsolation, string $code): ?SlidesTemplateTagEntity;

    public function findByCodeWithTrashed(SlidesTemplateDataIsolation $dataIsolation, string $code): ?SlidesTemplateTagEntity;

    /**
     * @param string[] $codes
     * @return SlidesTemplateTagEntity[]
     */
    public function findByCodes(SlidesTemplateDataIsolation $dataIsolation, array $codes, ?int $status = null): array;

    /**
     * @return array{total: int, list: SlidesTemplateTagEntity[]}
     */
    public function queriesWithTemplateCount(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateTagQuery $query, Page $page): array;

    public function save(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateTagEntity $entity): SlidesTemplateTagEntity;

    public function updateStatus(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $status, string $updatedUid): bool;

    public function updateSort(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $sort, string $updatedUid): bool;

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): bool;
}
