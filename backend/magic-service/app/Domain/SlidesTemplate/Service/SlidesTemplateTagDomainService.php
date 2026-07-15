<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateTagEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateTagQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagNodeType;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagStatus;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateTagRelationRepositoryInterface;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateTagRepositoryInterface;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use Hyperf\Database\Exception\QueryException;
use Throwable;

class SlidesTemplateTagDomainService
{
    public function __construct(
        private readonly SlidesTemplateTagRepositoryInterface $slidesTemplateTagRepository,
        private readonly SlidesTemplateTagRelationRepositoryInterface $slidesTemplateTagRelationRepository,
    ) {
    }

    public function findByIdOrFail(SlidesTemplateDataIsolation $dataIsolation, int|string $id): SlidesTemplateTagEntity
    {
        $entity = $this->slidesTemplateTagRepository->findById($dataIsolation, $id);
        if (! $entity) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_NOT_FOUND);
        }
        return $entity;
    }

    /**
     * @return array{total: int, list: SlidesTemplateTagEntity[]}
     */
    public function queriesWithTemplateCount(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateTagQuery $query, Page $page): array
    {
        return $this->slidesTemplateTagRepository->queriesWithTemplateCount($dataIsolation, $query, $page);
    }

    /**
     * @return SlidesTemplateTagEntity[]
     */
    public function queriesVisibleGroupsWithTagsByCategory(SlidesTemplateDataIsolation $dataIsolation, ?string $categoryCode): array
    {
        return $this->slidesTemplateTagRepository->queriesVisibleGroupsWithTagsByCategory($dataIsolation, $categoryCode);
    }

    /**
     * @return SlidesTemplateTagEntity[]
     */
    public function queriesTree(SlidesTemplateDataIsolation $dataIsolation): array
    {
        return $this->slidesTemplateTagRepository->queriesTree($dataIsolation);
    }

    public function create(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateTagEntity $entity): SlidesTemplateTagEntity
    {
        $this->assertTagStructure($dataIsolation, $entity);
        $this->prepareRestoreDeletedTag($dataIsolation, $entity);

        try {
            return $this->slidesTemplateTagRepository->save($dataIsolation, $entity);
        } catch (Throwable $throwable) {
            if ($this->isDuplicateCodeException($throwable)) {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_CODE_ALREADY_EXISTS);
            }
            throw $throwable;
        }
    }

    public function update(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateTagEntity $entity): SlidesTemplateTagEntity
    {
        $existing = $this->findByIdOrFail($dataIsolation, (string) $entity->getId());
        if ($existing->getNodeType() !== $entity->getNodeType()) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_STRUCTURE_INVALID);
        }

        $this->assertTagStructure($dataIsolation, $entity);
        try {
            return $this->slidesTemplateTagRepository->save($dataIsolation, $entity);
        } catch (Throwable $throwable) {
            if ($this->isDuplicateCodeException($throwable)) {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_CODE_ALREADY_EXISTS);
            }
            throw $throwable;
        }
    }

    public function updateStatus(SlidesTemplateDataIsolation $dataIsolation, int|string $id, SlidesTemplateTagStatus $status, string $updatedUid): void
    {
        if (! $this->slidesTemplateTagRepository->updateStatus($dataIsolation, $id, $status->value, $updatedUid)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_NOT_FOUND);
        }
    }

    public function updateSort(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $sort, string $updatedUid): void
    {
        if (! $this->slidesTemplateTagRepository->updateSort($dataIsolation, $id, $sort, $updatedUid)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_NOT_FOUND);
        }
    }

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): void
    {
        $entity = $this->findByIdOrFail($dataIsolation, $id);
        if ($entity->isGroup() && $this->slidesTemplateTagRepository->existsByParentId($dataIsolation, (int) $entity->getId())) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_STRUCTURE_INVALID);
        }

        if (! $this->slidesTemplateTagRepository->delete($dataIsolation, $id)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_NOT_FOUND);
        }
    }

    /**
     * @param string[] $codes
     * @return SlidesTemplateTagEntity[]
     */
    public function findEnabledByCodesOrFail(SlidesTemplateDataIsolation $dataIsolation, array $codes): array
    {
        $codes = $this->normalizeCodes($codes);
        if ($codes === []) {
            return [];
        }

        $tags = $this->slidesTemplateTagRepository->findByCodes($dataIsolation, $codes, SlidesTemplateTagStatus::Enabled->value);
        if (count($tags) !== count($codes)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_NOT_FOUND);
        }

        return $tags;
    }

    /**
     * @param string[] $tagCodes
     */
    public function syncTemplateTagsByCodes(SlidesTemplateDataIsolation $dataIsolation, int $templateId, array $tagCodes, string $createdUid): void
    {
        $tags = $this->findEnabledByCodesOrFail($dataIsolation, $tagCodes);
        foreach ($tags as $tag) {
            if (! $tag->isTag()) {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_GROUP_CANNOT_BIND);
            }
        }
        $tagIds = array_map(static fn (SlidesTemplateTagEntity $tag): int => (int) $tag->getId(), $tags);
        $this->slidesTemplateTagRelationRepository->syncTemplateTags($dataIsolation, $templateId, $tagIds, $createdUid);
    }

    public function deleteTemplateTags(SlidesTemplateDataIsolation $dataIsolation, int $templateId): void
    {
        $this->slidesTemplateTagRelationRepository->deleteByTemplateId($dataIsolation, $templateId);
    }

    /**
     * @param SlidesTemplateEntity[] $templates
     */
    public function fillTemplateTags(SlidesTemplateDataIsolation $dataIsolation, array $templates, ?SlidesTemplateTagStatus $tagStatus = null): void
    {
        $templateIds = [];
        foreach ($templates as $template) {
            $id = $template->getId();
            if ($id !== null) {
                $templateIds[] = $id;
            }
        }

        $tagMap = $this->slidesTemplateTagRelationRepository->findTagsByTemplateIds(
            $dataIsolation,
            $templateIds,
            $tagStatus?->value
        );

        foreach ($templates as $template) {
            $template->setTags($tagMap[(int) $template->getId()] ?? []);
        }
    }

    private function prepareRestoreDeletedTag(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateTagEntity $entity): void
    {
        $existing = $this->slidesTemplateTagRepository->findByCodeWithTrashed($dataIsolation, $entity->getCode());
        if (! $existing) {
            return;
        }

        if ($existing->getDeletedAt() === null) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_CODE_ALREADY_EXISTS);
        }

        $entity->setId($existing->getId());
        $entity->setOrganizationCode($existing->getOrganizationCode());
    }

    private function assertTagStructure(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateTagEntity $entity): void
    {
        if ($entity->isGroup()) {
            if ($entity->getParentId() !== 0 || ! str_ends_with($entity->getCode(), '_group')) {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_STRUCTURE_INVALID);
            }
            return;
        }

        if ($entity->getNodeType() !== SlidesTemplateTagNodeType::Tag
            || $entity->getParentId() <= 0) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_STRUCTURE_INVALID);
        }

        $parent = $this->slidesTemplateTagRepository->findById($dataIsolation, $entity->getParentId());
        if (! $parent || ! $parent->isGroup()) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::TAG_STRUCTURE_INVALID);
        }
    }

    private function isDuplicateCodeException(Throwable $throwable): bool
    {
        return $throwable instanceof QueryException && str_contains(strtolower($throwable->getMessage()), 'duplicate');
    }

    /**
     * @param string[] $codes
     * @return string[]
     */
    private function normalizeCodes(array $codes): array
    {
        $result = [];
        foreach ($codes as $code) {
            if (! is_string($code)) {
                continue;
            }
            $code = trim($code);
            if ($code !== '') {
                $result[$code] = $code;
            }
        }
        return array_values($result);
    }
}
