<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Application\Kernel\AbstractKernelAppService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Service\SlidesTemplateDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use Dtyq\CloudFile\Kernel\Struct\FileLink;
use Qbhy\HyperfAuth\Authenticatable;

abstract class AbstractSlidesTemplateAppService extends AbstractKernelAppService
{
    public function __construct(
        protected readonly SlidesTemplateDomainService $slidesTemplateDomainService,
    ) {
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

    /**
     * @param SlidesTemplateEntity[] $templates
     */
    protected function resolveAssetUrls(array $templates, bool $includeTemplateFileUrl = false): void
    {
        if ($templates === []) {
            return;
        }

        $pathsByOrg = [];
        foreach ($templates as $template) {
            $this->appendFilePath($pathsByOrg, $template->getOrganizationCode(), $template->getThumbnailFileKey());
            $this->appendFilePath($pathsByOrg, $template->getOrganizationCode(), $template->getCollageFileKey());
            if ($includeTemplateFileUrl) {
                $this->appendFilePath($pathsByOrg, $template->getOrganizationCode(), $template->getTemplateFileKey());
            }
        }

        $linksByOrg = [];
        foreach ($pathsByOrg as $organizationCode => $paths) {
            $linksByOrg[$organizationCode] = $this->getPrivateFileLinks($organizationCode, array_values(array_unique($paths)));
        }

        foreach ($templates as $template) {
            $organizationCode = $template->getOrganizationCode();
            $template->setThumbnailUrl($this->resolveUrl($linksByOrg, $organizationCode, $template->getThumbnailFileKey()));
            $template->setCollageUrl($this->resolveUrl($linksByOrg, $organizationCode, $template->getCollageFileKey()));
            if ($includeTemplateFileUrl) {
                $template->setTemplateFileUrl($this->resolveUrl($linksByOrg, $organizationCode, $template->getTemplateFileKey()));
            }
        }
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

    private function appendFilePath(array &$pathsByOrg, string $organizationCode, ?string $fileKey): void
    {
        if ($organizationCode === '' || $fileKey === null || $fileKey === '') {
            return;
        }
        $pathsByOrg[$organizationCode][] = $fileKey;
    }

    private function resolveUrl(array $linksByOrg, string $organizationCode, ?string $fileKey): ?string
    {
        if ($fileKey === null || $fileKey === '') {
            return null;
        }

        $fileLink = $linksByOrg[$organizationCode][$fileKey] ?? null;
        return $fileLink instanceof FileLink ? $fileLink->getUrl() : null;
    }
}
