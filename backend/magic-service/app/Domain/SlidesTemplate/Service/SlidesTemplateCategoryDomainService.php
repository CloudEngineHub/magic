<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateCategoryQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateCategoryStatus;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateCategoryRepositoryInterface;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use Hyperf\Database\Exception\QueryException;
use Throwable;

class SlidesTemplateCategoryDomainService
{
    public function __construct(
        private readonly SlidesTemplateCategoryRepositoryInterface $slidesTemplateCategoryRepository,
    ) {
    }

    public function findByIdOrFail(SlidesTemplateDataIsolation $dataIsolation, int|string $id): SlidesTemplateCategoryEntity
    {
        $entity = $this->slidesTemplateCategoryRepository->findById($dataIsolation, $id);
        if (! $entity) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::CATEGORY_NOT_FOUND);
        }
        return $entity;
    }

    public function findByCodeOrFail(SlidesTemplateDataIsolation $dataIsolation, string $code): SlidesTemplateCategoryEntity
    {
        $entity = $this->slidesTemplateCategoryRepository->findByCode($dataIsolation, $code);
        if (! $entity) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::CATEGORY_NOT_FOUND);
        }
        return $entity;
    }

    /**
     * @return array{total: int, list: SlidesTemplateCategoryEntity[]}
     */
    public function queries(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryQuery $query, Page $page): array
    {
        return $this->slidesTemplateCategoryRepository->queries($dataIsolation, $query, $page);
    }

    /**
     * @return array{total: int, list: SlidesTemplateCategoryEntity[]}
     */
    public function queriesWithTemplateCount(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryQuery $query, Page $page): array
    {
        return $this->slidesTemplateCategoryRepository->queriesWithTemplateCount($dataIsolation, $query, $page);
    }

    public function create(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryEntity $entity): SlidesTemplateCategoryEntity
    {
        if ($this->slidesTemplateCategoryRepository->existsByCode($entity->getCode())) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::CATEGORY_CODE_ALREADY_EXISTS);
        }

        try {
            return $this->slidesTemplateCategoryRepository->save($dataIsolation, $entity);
        } catch (Throwable $throwable) {
            if ($this->isDuplicateCodeException($throwable)) {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::CATEGORY_CODE_ALREADY_EXISTS);
            }
            throw $throwable;
        }
    }

    public function update(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryEntity $entity): SlidesTemplateCategoryEntity
    {
        $this->findByIdOrFail($dataIsolation, (string) $entity->getId());
        return $this->slidesTemplateCategoryRepository->save($dataIsolation, $entity);
    }

    public function updateStatus(SlidesTemplateDataIsolation $dataIsolation, int|string $id, SlidesTemplateCategoryStatus $status, string $updatedUid): void
    {
        if (! $this->slidesTemplateCategoryRepository->updateStatus($dataIsolation, $id, $status->value, $updatedUid)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::CATEGORY_NOT_FOUND);
        }
    }

    public function updateSort(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $sort, string $updatedUid): void
    {
        if (! $this->slidesTemplateCategoryRepository->updateSort($dataIsolation, $id, $sort, $updatedUid)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::CATEGORY_NOT_FOUND);
        }
    }

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): void
    {
        if (! $this->slidesTemplateCategoryRepository->delete($dataIsolation, $id)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::CATEGORY_NOT_FOUND);
        }
    }

    private function isDuplicateCodeException(Throwable $throwable): bool
    {
        return $throwable instanceof QueryException
            && (string) $throwable->getCode() === '23000'
            && str_contains($throwable->getMessage(), 'Duplicate entry');
    }
}
