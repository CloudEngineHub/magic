<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateRepositoryInterface;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;

class SlidesTemplateDomainService
{
    public function __construct(
        private readonly SlidesTemplateRepositoryInterface $slidesTemplateRepository,
    ) {
    }

    public function findByIdOrFail(SlidesTemplateDataIsolation $dataIsolation, int|string $id): SlidesTemplateEntity
    {
        $entity = $this->slidesTemplateRepository->findById($dataIsolation, $id);
        if (! $entity) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TEMPLATE_NOT_FOUND);
        }
        return $entity;
    }

    public function findEnabledByCodeOrFail(SlidesTemplateDataIsolation $dataIsolation, string $code): SlidesTemplateEntity
    {
        $entity = $this->slidesTemplateRepository->findByCode($dataIsolation, $code);
        if (! $entity || ! $entity->getStatus()->isEnabled()) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TEMPLATE_NOT_FOUND);
        }
        return $entity;
    }

    /**
     * @return array{total: int, list: SlidesTemplateEntity[]}
     */
    public function queries(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query, Page $page): array
    {
        return $this->slidesTemplateRepository->queries($dataIsolation, $query, $page);
    }

    public function create(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): SlidesTemplateEntity
    {
        return $this->slidesTemplateRepository->save($dataIsolation, $entity);
    }

    public function update(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): SlidesTemplateEntity
    {
        $this->findByIdOrFail($dataIsolation, (string) $entity->getId());
        return $this->slidesTemplateRepository->save($dataIsolation, $entity);
    }

    public function updateStatus(SlidesTemplateDataIsolation $dataIsolation, int|string $id, SlidesTemplateStatus $status, string $updatedUid): void
    {
        if (! $this->slidesTemplateRepository->updateStatus($dataIsolation, $id, $status->value, $updatedUid)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TEMPLATE_NOT_FOUND);
        }
    }

    public function updateSort(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $sort, string $updatedUid): void
    {
        if (! $this->slidesTemplateRepository->updateSort($dataIsolation, $id, $sort, $updatedUid)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TEMPLATE_NOT_FOUND);
        }
    }

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): void
    {
        if (! $this->slidesTemplateRepository->delete($dataIsolation, $id)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TEMPLATE_NOT_FOUND);
        }
    }
}
