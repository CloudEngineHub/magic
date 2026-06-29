<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Repository\Facade;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Infrastructure\Core\ValueObject\Page;

interface SlidesTemplateRepositoryInterface
{
    public function findById(SlidesTemplateDataIsolation $dataIsolation, int|string $id): ?SlidesTemplateEntity;

    public function findByCode(SlidesTemplateDataIsolation $dataIsolation, string $code): ?SlidesTemplateEntity;

    /**
     * @return array{total: int, list: SlidesTemplateEntity[]}
     */
    public function queries(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query, Page $page): array;

    public function save(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): SlidesTemplateEntity;

    public function updateStatus(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $status, string $updatedUid): bool;

    public function updateSort(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $sort, string $updatedUid): bool;

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): bool;
}
