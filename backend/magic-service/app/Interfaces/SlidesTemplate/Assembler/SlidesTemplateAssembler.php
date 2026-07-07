<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\Assembler;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use App\Interfaces\SlidesTemplate\DTO\Response\AdminSlidesTemplateDetailDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\AdminSlidesTemplateItemDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\AdminSlidesTemplateListItemDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\I18nTextDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateFileUrlDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePageDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePublicItemDTO;

class SlidesTemplateAssembler
{
    /**
     * @param SlidesTemplateEntity[] $templates
     * @param array<string, SlidesTemplateCategoryEntity> $categoryMap
     */
    public static function createPageDTO(
        array $templates,
        Page $page,
        int $total,
        bool $admin,
        bool $includeTemplateFileUrl,
        array $categoryMap = []
    ): SlidesTemplatePageDTO {
        $list = array_map(
            static function (SlidesTemplateEntity $template) use ($admin, $includeTemplateFileUrl, $categoryMap): AdminSlidesTemplateDetailDTO|AdminSlidesTemplateItemDTO|SlidesTemplatePublicItemDTO {
                if (! $admin) {
                    return self::createPublicItemDTO($template);
                }

                $categoryCode = $template->getCategoryCode();
                $category = $categoryCode === null ? null : ($categoryMap[$categoryCode] ?? null);
                return self::createAdminItemDTO($template, $includeTemplateFileUrl, $category);
            },
            $templates
        );

        return new SlidesTemplatePageDTO($page->getPage(), $page->getPageNum(), $total, $list);
    }

    public static function createAdminItemDTO(
        SlidesTemplateEntity $template,
        bool $includeTemplateFileUrl = false,
        ?SlidesTemplateCategoryEntity $category = null
    ): AdminSlidesTemplateDetailDTO|AdminSlidesTemplateItemDTO {
        $dto = $includeTemplateFileUrl ? new AdminSlidesTemplateDetailDTO() : new AdminSlidesTemplateListItemDTO();
        $dto->setId($template->getId());
        $dto->setOrganizationCode($template->getOrganizationCode());
        $dto->setCode($template->getCode());
        $dto->setSourceType($template->getSourceType()->value);
        $dto->setCategoryCode($template->getCategoryCode());
        if ($dto instanceof AdminSlidesTemplateListItemDTO) {
            $dto->setCategory($category === null ? null : SlidesTemplateCategoryAssembler::createAdminSummaryDTO($category));
        }
        $dto->setLabel(I18nTextDTO::fromArray($template->getLabel()));
        $dto->setDescription(I18nTextDTO::fromArray($template->getDescription()));
        $dto->setThumbnailFileKey($template->getThumbnailFileKey());
        $dto->setThumbnailUrl($template->getThumbnailUrl());
        $dto->setCollageFileKey($template->getCollageFileKey());
        $dto->setCollageUrl($template->getCollageUrl());
        $dto->setTemplateFileKey($template->getTemplateFileKey());
        $dto->setPreviewUrl($template->getPreviewUrl());
        $dto->setStatus($template->getStatus()->value);
        $dto->setSort($template->getSort());
        $dto->setCreatedUid($template->getCreatedUid());
        $dto->setUpdatedUid($template->getUpdatedUid());
        $dto->setCreatedAt($template->getCreatedAt());
        $dto->setUpdatedAt($template->getUpdatedAt());

        if ($dto instanceof AdminSlidesTemplateDetailDTO) {
            $dto->setTemplateFileUrl($template->getTemplateFileUrl());
        }

        return $dto;
    }

    public static function createAdminDetailDTO(SlidesTemplateEntity $template): AdminSlidesTemplateDetailDTO
    {
        $dto = self::createAdminItemDTO($template, true);
        if ($dto instanceof AdminSlidesTemplateDetailDTO) {
            return $dto;
        }

        return new AdminSlidesTemplateDetailDTO();
    }

    public static function createPublicItemDTO(SlidesTemplateEntity $template): SlidesTemplatePublicItemDTO
    {
        $dto = new SlidesTemplatePublicItemDTO();
        $dto->setCode($template->getCode());
        $dto->setSourceType($template->getSourceType()->value);
        $dto->setCategoryCode($template->getCategoryCode());
        $dto->setLabel(I18nTextDTO::fromArray($template->getLabel()));
        $dto->setDescription(I18nTextDTO::fromArray($template->getDescription()));
        $dto->setThumbnailUrl($template->getThumbnailUrl());
        $dto->setCollageUrl($template->getCollageUrl());
        $dto->setPreviewUrl($template->getPreviewUrl());
        $dto->setSort($template->getSort());
        $dto->setIsOfficial(OfficialOrganizationUtil::isOfficialOrganization($template->getOrganizationCode()));
        return $dto;
    }

    public static function createFileUrlDTO(SlidesTemplateEntity $template): SlidesTemplateFileUrlDTO
    {
        $dto = new SlidesTemplateFileUrlDTO();
        $dto->setCode($template->getCode());
        $dto->setSourceType($template->getSourceType()->value);
        $dto->setCategoryCode($template->getCategoryCode());
        $dto->setLabel(I18nTextDTO::fromArray($template->getLabel()));
        $dto->setTemplateFileUrl($template->getTemplateFileUrl());
        return $dto;
    }
}
