<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\ModelGateway\Service;

use App\Domain\ModelGateway\Entity\ValueObject\SourceId;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Event\SlidesTemplateUsedEvent;
use App\Domain\SlidesTemplate\Service\SlidesTemplateDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\Context\CoContext;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Dtyq\CloudFile\Kernel\Struct\FileLink;
use Qbhy\HyperfAuth\Authenticatable;

use function event_dispatch;

class SlidesTemplateAppService extends AbstractLLMAppService
{
    public function __construct(
        protected readonly SlidesTemplateDomainService $slidesTemplateDomainService,
    ) {
    }

    public function getTemplateFileUrl(Authenticatable|BaseDataIsolation $authorization, string $code): SlidesTemplateEntity
    {
        $startTime = microtime(true);
        $dataIsolation = $this->createSlidesTemplateDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);

        $template = $this->slidesTemplateDomainService->findEnabledByCodeOrFail($dataIsolation, $code);
        $this->resolveTemplateFileUrl($template);
        $this->slidesTemplateDomainService->incrementActualUsageCount($dataIsolation, $template->getCode());
        $this->dispatchSlidesTemplateUsedEvent(
            $dataIsolation,
            $template,
            $startTime
        );

        return $template;
    }

    protected function resolveTemplateFileUrl(SlidesTemplateEntity $template): void
    {
        $fileLinks = $this->getPrivateFileLinks($template->getOrganizationCode(), [$template->getTemplateFileKey()]);
        $fileLink = $fileLinks[$template->getTemplateFileKey()] ?? null;
        if (! $fileLink instanceof FileLink) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::FILE_URL_GENERATE_FAILED);
        }
        $template->setTemplateFileUrl($fileLink->getUrl());
    }

    protected function dispatchSlidesTemplateUsedEvent(
        SlidesTemplateDataIsolation $dataIsolation,
        SlidesTemplateEntity $template,
        float $startTime
    ): void {
        $requestId = trim(CoContext::getRequestId());
        event_dispatch(new SlidesTemplateUsedEvent(
            organizationCode: $dataIsolation->getCurrentOrganizationCode(),
            sourceId: SourceId::SLIDES_TEMPLATE_USE,
            callTime: (int) round($startTime * 1000),
            userId: $dataIsolation->getCurrentUserId(),
            userName: $dataIsolation->getCurrentUserId(),
            requestId: $requestId === '' ? IdGenerator::getUniqueId32() : $requestId,
            template: $template,
        ));
    }

    protected function createSlidesTemplateDataIsolation(Authenticatable|BaseDataIsolation $authorization): SlidesTemplateDataIsolation
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
}
