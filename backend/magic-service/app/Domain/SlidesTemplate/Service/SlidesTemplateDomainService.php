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
use App\Domain\SlidesTemplate\Service\UsageCount\SlidesTemplateUsageCountPolicyInterface;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use Hyperf\Database\Exception\QueryException;
use Throwable;

class SlidesTemplateDomainService
{
    public function __construct(
        private readonly SlidesTemplateRepositoryInterface $slidesTemplateRepository,
        private readonly SlidesTemplateUsageCountPolicyInterface $usageCountPolicy,
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

    /**
     * @return array{total: int, total_usage_count: int, template_count_today_growth: int}
     */
    public function getCount(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query): array
    {
        return $this->usageCountPolicy->getCount($dataIsolation, $query);
    }

    public function create(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): SlidesTemplateEntity
    {
        $this->prepareRestoreDeletedTemplate($dataIsolation, $entity);

        $this->refreshSearchText($entity);
        $totalUsageCount = max(0, $entity->getBaseUsageCount()) + max(0, $entity->getActualUsageCount());
        $entity->setTotalUsageCount($totalUsageCount);
        try {
            return $this->slidesTemplateRepository->save($dataIsolation, $entity);
        } catch (Throwable $throwable) {
            if ($this->isDuplicateCodeException($throwable)) {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::CODE_ALREADY_EXISTS);
            }

            throw $throwable;
        }
    }

    public function update(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): SlidesTemplateEntity
    {
        $this->findByIdOrFail($dataIsolation, (string) $entity->getId());
        $this->refreshSearchText($entity);
        $totalUsageCount = max(0, $entity->getBaseUsageCount()) + max(0, $entity->getActualUsageCount());
        $entity->setTotalUsageCount($totalUsageCount);
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

    public function incrementActualUsageCount(SlidesTemplateDataIsolation $dataIsolation, string $code): void
    {
        $this->slidesTemplateRepository->incrementActualUsageCount(
            $dataIsolation,
            $code,
            1
        );
    }

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): void
    {
        if (! $this->slidesTemplateRepository->delete($dataIsolation, $id)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TEMPLATE_NOT_FOUND);
        }
    }

    private function refreshSearchText(SlidesTemplateEntity $entity): void
    {
        $entity->setSearchText(SlidesTemplateSearchTextBuilder::build($entity));
    }

    private function prepareRestoreDeletedTemplate(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): void
    {
        $existing = $this->slidesTemplateRepository->findByCodeWithTrashed($dataIsolation, $entity->getCode());
        if (! $existing) {
            return;
        }

        if ($existing->getDeletedAt() === null) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::CODE_ALREADY_EXISTS);
        }

        $entity->setId($existing->getId());
        $entity->setActualUsageCount($existing->getActualUsageCount());
    }

    private function isDuplicateCodeException(Throwable $throwable): bool
    {
        return $throwable instanceof QueryException
            && (string) $throwable->getCode() === '23000'
            && str_contains($throwable->getMessage(), 'Duplicate entry');
    }
}
