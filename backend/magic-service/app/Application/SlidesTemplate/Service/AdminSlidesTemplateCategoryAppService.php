<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Application\Kernel\AbstractKernelAppService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateCategoryQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateCategoryStatus;
use App\Domain\SlidesTemplate\Service\SlidesTemplateCategoryDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\SlidesTemplate\DTO\Request\AdminQuerySlidesTemplateCategoryRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\SaveSlidesTemplateCategoryRequest;
use Qbhy\HyperfAuth\Authenticatable;

class AdminSlidesTemplateCategoryAppService extends AbstractKernelAppService
{
    public function __construct(
        private readonly SlidesTemplateCategoryDomainService $slidesTemplateCategoryDomainService,
    ) {
    }

    /**
     * @return array{page: Page, total: int, list: SlidesTemplateCategoryEntity[]}
     */
    public function queries(Authenticatable|BaseDataIsolation $authorization, AdminQuerySlidesTemplateCategoryRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $query = new SlidesTemplateCategoryQuery();
        $query->setKeyword($request->getKeyword());
        $query->setCode($request->getCode());
        $query->setStatus($request->getStatus());

        $page = new Page($request->getPage(), $request->getPageSize());
        $result = $this->slidesTemplateCategoryDomainService->queries($dataIsolation, $query, $page);

        return [
            'page' => $page,
            'total' => $result['total'],
            'list' => $result['list'],
        ];
    }

    public function detail(Authenticatable|BaseDataIsolation $authorization, int|string $id): SlidesTemplateCategoryEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        return $this->slidesTemplateCategoryDomainService->findByIdOrFail($dataIsolation, $id);
    }

    public function create(Authenticatable|BaseDataIsolation $authorization, SaveSlidesTemplateCategoryRequest $request): SlidesTemplateCategoryEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $category = $this->buildEntityFromRequest($request);
        $category->setOrganizationCode($dataIsolation->getCurrentOrganizationCode());
        $category->setCreatedUid($dataIsolation->getCurrentUserId());
        $category->setUpdatedUid($dataIsolation->getCurrentUserId());

        return $this->slidesTemplateCategoryDomainService->create($dataIsolation, $category);
    }

    public function update(Authenticatable|BaseDataIsolation $authorization, int|string $id, SaveSlidesTemplateCategoryRequest $request): SlidesTemplateCategoryEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $existing = $this->slidesTemplateCategoryDomainService->findByIdOrFail($dataIsolation, $id);
        $category = $this->buildEntityFromRequest($request);
        $category->setId($existing->getId());
        $category->setOrganizationCode($existing->getOrganizationCode());
        $category->setCreatedUid($existing->getCreatedUid());
        $category->setUpdatedUid($dataIsolation->getCurrentUserId());

        return $this->slidesTemplateCategoryDomainService->update($dataIsolation, $category);
    }

    public function updateStatus(Authenticatable|BaseDataIsolation $authorization, int|string $id, int $status): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->slidesTemplateCategoryDomainService->updateStatus(
            $dataIsolation,
            $id,
            SlidesTemplateCategoryStatus::from($status),
            $dataIsolation->getCurrentUserId()
        );
    }

    public function updateSort(Authenticatable|BaseDataIsolation $authorization, int|string $id, int $sort): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->slidesTemplateCategoryDomainService->updateSort($dataIsolation, $id, $sort, $dataIsolation->getCurrentUserId());
    }

    public function delete(Authenticatable|BaseDataIsolation $authorization, int|string $id): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->slidesTemplateCategoryDomainService->delete($dataIsolation, $id);
    }

    private function createSlidesTemplateDataIsolation(Authenticatable|BaseDataIsolation $authorization): SlidesTemplateDataIsolation
    {
        if ($authorization instanceof SlidesTemplateDataIsolation) {
            return $authorization;
        }

        $dataIsolation = new SlidesTemplateDataIsolation();
        if ($authorization instanceof BaseDataIsolation) {
            $dataIsolation->extends($authorization);
            $dataIsolation->setOfficialOrganizationCodes($authorization->getOfficialOrganizationCodes());
            return $dataIsolation;
        }
        $this->handleByAuthorization($authorization, $dataIsolation);
        return $dataIsolation;
    }

    private function assertOfficialOrganization(SlidesTemplateDataIsolation $dataIsolation): void
    {
        if (! $dataIsolation->isOfficialOrganization()) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::ONLY_OFFICIAL_ORGANIZATION_CAN_MANAGE);
        }
    }

    private function buildEntityFromRequest(SaveSlidesTemplateCategoryRequest $request): SlidesTemplateCategoryEntity
    {
        $category = new SlidesTemplateCategoryEntity();
        $category->setCode($request->getCode());
        $category->setNameI18n($request->getNameI18n());
        $category->setStatus($request->getStatus());
        $category->setSort($request->getSort());
        return $category;
    }
}
