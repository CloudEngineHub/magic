<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateRequest;
use Qbhy\HyperfAuth\Authenticatable;

class SlidesTemplateAppService extends AbstractSlidesTemplateAppService
{
    /**
     * @return array{page: Page, total: int, list: SlidesTemplateEntity[]}
     */
    public function queries(Authenticatable|BaseDataIsolation $authorization, PublicQuerySlidesTemplateRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);

        $query = new SlidesTemplateQuery();
        $query->setKeyword($request->getKeyword());
        $query->setStatus(SlidesTemplateStatus::Enabled->value);

        $page = new Page($request->getPage(), $request->getPageSize());
        $result = $this->slidesTemplateDomainService->queries($dataIsolation, $query, $page);
        $this->resolveAssetUrls($result['list'], includeTemplateFileUrl: false);

        return [
            'page' => $page,
            'total' => $result['total'],
            'list' => $result['list'],
        ];
    }

    public function getTemplateFileUrl(Authenticatable|BaseDataIsolation $authorization, string $code): SlidesTemplateEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);

        $template = $this->slidesTemplateDomainService->findEnabledByCodeOrFail($dataIsolation, $code);
        $this->resolveTemplateFileUrl($template);

        return $template;
    }
}
