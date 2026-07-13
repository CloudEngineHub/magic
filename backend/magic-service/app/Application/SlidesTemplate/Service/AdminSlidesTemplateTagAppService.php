<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Application\Kernel\AbstractKernelAppService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateTagEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateTagQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagStatus;
use App\Domain\SlidesTemplate\Service\SlidesTemplateTagDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\SlidesTemplate\DTO\Request\AdminQuerySlidesTemplateTagRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\SaveSlidesTemplateTagRequest;
use Qbhy\HyperfAuth\Authenticatable;

class AdminSlidesTemplateTagAppService extends AbstractKernelAppService
{
    public function __construct(
        private readonly SlidesTemplateTagDomainService $slidesTemplateTagDomainService,
    ) {
    }

    /**
     * @return array{page: Page, total: int, list: SlidesTemplateTagEntity[]}
     */
    public function queries(Authenticatable|BaseDataIsolation $authorization, AdminQuerySlidesTemplateTagRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $query = new SlidesTemplateTagQuery();
        $query->setKeyword($request->getKeyword());
        $query->setCode($request->getCode());
        $query->setParentId($request->getParentId());
        $query->setNodeType($request->getNodeType());
        $query->setUsageType($request->getUsageType());
        $query->setIsVisible($request->getIsVisible());
        $query->setStatus($request->getStatus());

        $page = new Page($request->getPage(), $request->getPageSize());
        $result = $this->slidesTemplateTagDomainService->queriesWithTemplateCount($dataIsolation, $query, $page);

        return [
            'page' => $page,
            'total' => $result['total'],
            'list' => $result['list'],
        ];
    }

    public function detail(Authenticatable|BaseDataIsolation $authorization, int|string $id): SlidesTemplateTagEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        return $this->slidesTemplateTagDomainService->findByIdOrFail($dataIsolation, $id);
    }

    public function create(Authenticatable|BaseDataIsolation $authorization, SaveSlidesTemplateTagRequest $request): SlidesTemplateTagEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $tag = $this->buildEntityFromRequest($request);
        $tag->setOrganizationCode($dataIsolation->getCurrentOrganizationCode());
        $tag->setCreatedUid($dataIsolation->getCurrentUserId());
        $tag->setUpdatedUid($dataIsolation->getCurrentUserId());

        return $this->slidesTemplateTagDomainService->create($dataIsolation, $tag);
    }

    public function update(Authenticatable|BaseDataIsolation $authorization, int|string $id, SaveSlidesTemplateTagRequest $request): SlidesTemplateTagEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $existing = $this->slidesTemplateTagDomainService->findByIdOrFail($dataIsolation, $id);
        $tag = $this->buildEntityFromRequest($request);
        $tag->setId($existing->getId());
        $tag->setOrganizationCode($existing->getOrganizationCode());
        $tag->setCreatedUid($existing->getCreatedUid());
        $tag->setUpdatedUid($dataIsolation->getCurrentUserId());

        return $this->slidesTemplateTagDomainService->update($dataIsolation, $tag);
    }

    public function updateStatus(Authenticatable|BaseDataIsolation $authorization, int|string $id, int $status): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->slidesTemplateTagDomainService->updateStatus(
            $dataIsolation,
            $id,
            SlidesTemplateTagStatus::from($status),
            $dataIsolation->getCurrentUserId()
        );
    }

    public function updateSort(Authenticatable|BaseDataIsolation $authorization, int|string $id, int $sort): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->slidesTemplateTagDomainService->updateSort($dataIsolation, $id, $sort, $dataIsolation->getCurrentUserId());
    }

    public function delete(Authenticatable|BaseDataIsolation $authorization, int|string $id): void
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $this->assertOfficialOrganization($dataIsolation);

        $this->slidesTemplateTagDomainService->delete($dataIsolation, $id);
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

    private function buildEntityFromRequest(SaveSlidesTemplateTagRequest $request): SlidesTemplateTagEntity
    {
        $tag = new SlidesTemplateTagEntity();
        $tag->setParentId($request->getParentId());
        $tag->setNodeType($request->getNodeType());
        $tag->setUsageType($request->getUsageType());
        $tag->setCode($request->getCode());
        $tag->setNameI18n($request->getNameI18n());
        $tag->setDescriptionI18n($request->getDescriptionI18n());
        $tag->setAliasesI18n($request->getAliasesI18n());
        $tag->setIsVisible($request->isVisible());
        $tag->setStatus($request->getStatus());
        $tag->setSort($request->getSort());
        return $tag;
    }
}
