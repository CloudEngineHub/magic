<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagStatus;
use App\Domain\SlidesTemplate\Service\SlidesTemplateDomainService;
use App\Domain\SlidesTemplate\Service\SlidesTemplateTagDomainService;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateRequest;
use Qbhy\HyperfAuth\Authenticatable;

class SlidesTemplateAppService extends AbstractSlidesTemplateAppService
{
    public function __construct(
        SlidesTemplateDomainService $slidesTemplateDomainService,
        private readonly SlidesTemplateTagDomainService $slidesTemplateTagDomainService,
    ) {
        parent::__construct($slidesTemplateDomainService);
    }

    /**
     * @return array{page: Page, list: SlidesTemplateEntity[]}
     */
    public function queries(Authenticatable|BaseDataIsolation $authorization, PublicQuerySlidesTemplateRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);

        $query = $this->createPublicQuery($request);
        $page = $this->createListPage($request->getPage(), $request->getPageSize());
        $page->setTotal(false);
        $result = $this->slidesTemplateDomainService->queries($dataIsolation, $query, $page);
        $this->resolveListImageUrls($result['list']);
        $this->fillPublicTemplateTags($dataIsolation, $result['list']);

        return [
            'page' => $page,
            'list' => $result['list'],
        ];
    }

    public function count(Authenticatable|BaseDataIsolation $authorization, PublicQuerySlidesTemplateRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        $query = $this->createPublicQuery($request);

        return $this->slidesTemplateDomainService->getCount($dataIsolation, $query);
    }

    public function detail(Authenticatable|BaseDataIsolation $authorization, string $code): SlidesTemplateEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);

        $template = $this->slidesTemplateDomainService->findEnabledByCodeOrFail($dataIsolation, $code);
        $this->resolveAssetUrls([$template], includeTemplateFileUrl: false);
        $this->fillPublicTemplateTags($dataIsolation, [$template]);

        return $template;
    }

    private function createPublicQuery(PublicQuerySlidesTemplateRequest $request): SlidesTemplateQuery
    {
        $query = new SlidesTemplateQuery();
        $query->setKeyword($request->getKeyword());
        $query->setCategoryCode($request->getCategoryCode());
        $query->setStatus(SlidesTemplateStatus::Enabled->value);
        $query->setTagCodes($request->getTagCodes());
        $query->setTagMatch($request->getTagMatch());
        return $query;
    }

    /**
     * @param SlidesTemplateEntity[] $templates
     */
    private function fillPublicTemplateTags(SlidesTemplateDataIsolation $dataIsolation, array $templates): void
    {
        // 如前台列表后续不需要 tags，可注释此调用，列表主数据与图片解析逻辑不受影响。
        $this->slidesTemplateTagDomainService->fillTemplateTags(
            $dataIsolation,
            $templates,
            SlidesTemplateTagStatus::Enabled
        );
    }
}
