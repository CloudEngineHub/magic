<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateSourceType;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Domain\SlidesTemplate\Service\SlidesTemplateCategoryDomainService;
use App\Domain\SlidesTemplate\Service\SlidesTemplateDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\SlidesTemplate\DTO\Request\AdminQuerySlidesTemplateRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\SaveSlidesTemplateRequest;
use Qbhy\HyperfAuth\Authenticatable;

class AdminSlidesTemplateAppService extends AbstractSlidesTemplateAppService
{
    private const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'];

    public function __construct(
        SlidesTemplateDomainService $slidesTemplateDomainService,
        private readonly SlidesTemplateCategoryDomainService $slidesTemplateCategoryDomainService,
    ) {
        parent::__construct($slidesTemplateDomainService);
    }

    /**
     * @return array{page: Page, total: int, list: SlidesTemplateEntity[], categories: array<string, SlidesTemplateCategoryEntity>}
     */
    public function queries(Authenticatable|BaseDataIsolation $authorization, AdminQuerySlidesTemplateRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $query = $this->buildQuery($request->getKeyword(), $request->getCode(), $request->getCategoryCode(), $request->getStatus());
        $page = $this->createListPage($request->getPage(), $request->getPageSize());
        $result = $this->slidesTemplateDomainService->queries($dataIsolation, $query, $page);
        $this->resolveThumbnailUrls($result['list']);
        $categories = $this->resolveCategories($dataIsolation, $result['list']);

        return [
            'page' => $page,
            'total' => $result['total'],
            'list' => $result['list'],
            'categories' => $categories,
        ];
    }

    public function detail(Authenticatable|BaseDataIsolation $authorization, int|string $id): SlidesTemplateEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $template = $this->slidesTemplateDomainService->findByIdOrFail($dataIsolation, $id);
        $this->resolveAssetUrls([$template], includeTemplateFileUrl: true);

        return $template;
    }

    public function create(Authenticatable|BaseDataIsolation $authorization, SaveSlidesTemplateRequest $request): SlidesTemplateEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->assertCategoryExists($dataIsolation, $request->getCategoryCode());
        $this->assertTemplateFileIsArchive($request->getTemplateFileKey());
        $template = $this->buildEntityFromRequest($request);
        $template->setCode($request->getCode() ?? SlidesTemplateEntity::generateNewCode());
        $template->setSourceType(SlidesTemplateSourceType::Custom);
        $template->setOrganizationCode($dataIsolation->getCurrentOrganizationCode());
        $template->setCreatedUid($dataIsolation->getCurrentUserId());
        $template->setUpdatedUid($dataIsolation->getCurrentUserId());

        $template = $this->slidesTemplateDomainService->create($dataIsolation, $template);
        $this->resolveAssetUrls([$template], includeTemplateFileUrl: true);

        return $template;
    }

    public function update(Authenticatable|BaseDataIsolation $authorization, int|string $id, SaveSlidesTemplateRequest $request): SlidesTemplateEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->assertCategoryExists($dataIsolation, $request->getCategoryCode());
        $this->assertTemplateFileIsArchive($request->getTemplateFileKey());
        $existing = $this->slidesTemplateDomainService->findByIdOrFail($dataIsolation, $id);
        $template = $this->buildEntityFromRequest($request);
        $template->setId($existing->getId());
        $template->setOrganizationCode($existing->getOrganizationCode());
        $template->setCode($existing->getCode());
        $template->setSourceType($existing->getSourceType());
        $template->setActualUsageCount($existing->getActualUsageCount());
        $template->setCreatedUid($existing->getCreatedUid());
        $template->setUpdatedUid($dataIsolation->getCurrentUserId());

        $template = $this->slidesTemplateDomainService->update($dataIsolation, $template);
        $this->resolveAssetUrls([$template], includeTemplateFileUrl: true);

        return $template;
    }

    public function updateStatus(Authenticatable|BaseDataIsolation $authorization, int|string $id, int $status): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->slidesTemplateDomainService->updateStatus(
            $dataIsolation,
            $id,
            SlidesTemplateStatus::from($status),
            $dataIsolation->getCurrentUserId()
        );
    }

    public function updateSort(Authenticatable|BaseDataIsolation $authorization, int|string $id, int $sort): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->slidesTemplateDomainService->updateSort($dataIsolation, $id, $sort, $dataIsolation->getCurrentUserId());
    }

    public function delete(Authenticatable|BaseDataIsolation $authorization, int|string $id): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->slidesTemplateDomainService->delete($dataIsolation, $id);
    }

    private function assertOfficialOrganization(SlidesTemplateDataIsolation $dataIsolation): void
    {
        if (! $dataIsolation->isOfficialOrganization()) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::ONLY_OFFICIAL_ORGANIZATION_CAN_MANAGE);
        }
    }

    private function buildQuery(?string $keyword, ?string $code, ?string $categoryCode, ?int $status): SlidesTemplateQuery
    {
        $query = new SlidesTemplateQuery();
        $query->setKeyword($keyword);
        $query->setCode($code);
        $query->setCategoryCode($categoryCode);
        $query->setStatus($status);
        return $query;
    }

    private function buildEntityFromRequest(SaveSlidesTemplateRequest $request): SlidesTemplateEntity
    {
        $template = new SlidesTemplateEntity();
        $template->setCategoryCode($request->getCategoryCode());
        $template->setLabel($request->getLabel());
        $template->setDescription($request->getDescription());
        $template->setThumbnailFileKey($request->getThumbnailFileKey());
        $template->setCollageFileKey($request->getCollageFileKey());
        $template->setPreviewImageFileKeys($request->getPreviewImageFileKeys());
        $template->setTemplateFileKey($request->getTemplateFileKey());
        $template->setPreviewUrl($request->getPreviewUrl());
        $template->setStatus($request->getStatus());
        $template->setSort($request->getSort());
        $template->setBaseUsageCount($request->getBaseUsageCount());
        return $template;
    }

    private function assertCategoryExists(SlidesTemplateDataIsolation $dataIsolation, ?string $categoryCode): void
    {
        if ($categoryCode === null) {
            return;
        }

        $this->slidesTemplateCategoryDomainService->findByCodeOrFail($dataIsolation, $categoryCode);
    }

    private function assertTemplateFileIsArchive(string $templateFileKey): void
    {
        $extension = strtolower(pathinfo($templateFileKey, PATHINFO_EXTENSION));
        if (! in_array($extension, self::ARCHIVE_EXTENSIONS, true)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::VALIDATE_FAILED, 'slides_template.template_file_must_be_archive');
        }
    }

    /**
     * @param SlidesTemplateEntity[] $templates
     * @return array<string, SlidesTemplateCategoryEntity>
     */
    private function resolveCategories(SlidesTemplateDataIsolation $dataIsolation, array $templates): array
    {
        $categoryCodes = [];
        foreach ($templates as $template) {
            $categoryCode = $template->getCategoryCode();
            if ($categoryCode !== null) {
                $categoryCodes[$categoryCode] = $categoryCode;
            }
        }

        if ($categoryCodes === []) {
            return [];
        }

        $categories = $this->slidesTemplateCategoryDomainService->findByCodes($dataIsolation, array_values($categoryCodes));
        $categoryMap = [];
        foreach ($categories as $category) {
            $categoryMap[$category->getCode()] = $category;
        }
        return $categoryMap;
    }
}
