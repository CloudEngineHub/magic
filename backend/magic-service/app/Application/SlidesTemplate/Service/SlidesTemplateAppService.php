<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagStatus;
use App\Domain\SlidesTemplate\Event\SlidesTemplateUsedEvent;
use App\Domain\SlidesTemplate\Service\SlidesTemplateDomainService;
use App\Domain\SlidesTemplate\Service\SlidesTemplateTagDomainService;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateRequest;
use Qbhy\HyperfAuth\Authenticatable;

use function event_dispatch;

class SlidesTemplateAppService extends AbstractSlidesTemplateAppService
{
    public function __construct(
        SlidesTemplateDomainService $slidesTemplateDomainService,
        private readonly SlidesTemplateTagDomainService $slidesTemplateTagDomainService,
    ) {
        parent::__construct($slidesTemplateDomainService);
    }

    /**
     * @return array{page: Page, total: int, list: SlidesTemplateEntity[]}
     */
    public function queries(Authenticatable|BaseDataIsolation $authorization, PublicQuerySlidesTemplateRequest $request): array
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);

        $query = new SlidesTemplateQuery();
        $query->setKeyword($request->getKeyword());
        $query->setCategoryCode($request->getCategoryCode());
        $query->setStatus(SlidesTemplateStatus::Enabled->value);
        $query->setTagCodes($request->getTagCodes());
        $query->setTagMatch($request->getTagMatch());

        $page = $this->createListPage($request->getPage(), $request->getPageSize());
        $page->setTotal(true);
        $result = $this->slidesTemplateDomainService->queries($dataIsolation, $query, $page);
        $this->resolveAssetUrls($result['list'], includeTemplateFileUrl: false);
        $this->slidesTemplateTagDomainService->fillTemplateTags(
            $dataIsolation,
            $result['list'],
            SlidesTemplateTagStatus::Enabled
        );

        return [
            'page' => $page,
            'total' => $result['total'],
            'list' => $result['list'],
        ];
    }

    public function getTemplateFileUrl(Authenticatable|BaseDataIsolation $authorization, string $code, array $accessContext = []): SlidesTemplateEntity
    {
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);

        $template = $this->slidesTemplateDomainService->findEnabledByCodeOrFail($dataIsolation, $code);
        $this->resolveTemplateFileUrl($template);
        $this->slidesTemplateDomainService->incrementActualUsageCount($dataIsolation, $template->getCode());
        $this->dispatchSlidesTemplateUsedEvent($this->createSlidesTemplateUsedEvent(
            $authorization,
            $dataIsolation,
            $template,
            $accessContext
        ));

        return $template;
    }

    protected function dispatchSlidesTemplateUsedEvent(SlidesTemplateUsedEvent $event): void
    {
        event_dispatch($event);
    }

    private function createSlidesTemplateUsedEvent(
        Authenticatable|BaseDataIsolation $authorization,
        BaseDataIsolation $dataIsolation,
        SlidesTemplateEntity $template,
        array $accessContext
    ): SlidesTemplateUsedEvent {
        $userId = $dataIsolation->getCurrentUserId();
        $organizationCode = $dataIsolation->getCurrentOrganizationCode();
        $userName = $userId;

        if ($authorization instanceof MagicUserAuthorization) {
            $userId = $authorization->getId();
            $organizationCode = $authorization->getOrganizationCode();
            $userName = $authorization->getRealName() ?: $authorization->getNickname() ?: $authorization->getId();
        }

        return new SlidesTemplateUsedEvent(
            $userId,
            $organizationCode,
            $userName,
            $template,
            $accessContext
        );
    }
}
