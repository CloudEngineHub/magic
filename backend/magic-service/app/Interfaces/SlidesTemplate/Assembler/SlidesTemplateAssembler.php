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
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateCountDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateFileUrlDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateListPageDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePageDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePublicDetailDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePublicItemDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePublicListItemDTO;

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
        $dto->setColors($template->getColors());
        $dto->setCollageFileKey($template->getCollageFileKey());
        $dto->setCollageUrl($template->getCollageUrl());
        $dto->setPreviewImageFileKeys($template->getPreviewImageFileKeys());
        $dto->setPreviewImageUrls($template->getPreviewImageUrls());
        $dto->setTemplateFileKey($template->getTemplateFileKey());
        $dto->setPreviewUrl($template->getPreviewUrl());
        $dto->setStatus($template->getStatus()->value);
        $dto->setSort($template->getSort());
        $dto->setBaseUsageCount($template->getBaseUsageCount());
        $dto->setActualUsageCount($template->getActualUsageCount());
        $dto->setTotalUsageCount($template->getTotalUsageCount());
        $dto->setUsageCount($template->getUsageCount());
        $dto->setCreatedUid($template->getCreatedUid());
        $dto->setUpdatedUid($template->getUpdatedUid());
        $dto->setCreatedAt($template->getCreatedAt());
        $dto->setUpdatedAt($template->getUpdatedAt());
        $dto->setTags(array_map(
            static fn ($tag) => SlidesTemplateTagAssembler::createAdminItemDTO($tag),
            $template->getTags()
        ));

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

    /**
     * @param SlidesTemplateEntity[] $templates
     */
    public static function createPublicListPageDTO(array $templates, Page $page): SlidesTemplateListPageDTO
    {
        return new SlidesTemplateListPageDTO(
            $page->getPage(),
            $page->getPageNum(),
            array_map(static fn (SlidesTemplateEntity $template): SlidesTemplatePublicListItemDTO => self::createPublicListItemDTO($template), $templates)
        );
    }

    public static function createPublicListItemDTO(SlidesTemplateEntity $template): SlidesTemplatePublicListItemDTO
    {
        $dto = new SlidesTemplatePublicListItemDTO();
        $dto->setCode($template->getCode());
        $dto->setSourceType($template->getSourceType()->value);
        $dto->setCategoryCode($template->getCategoryCode());
        $dto->setLabel(I18nTextDTO::fromArray($template->getLabel()));
        $dto->setDescription(I18nTextDTO::fromArray($template->getDescription()));
        $dto->setThumbnailUrl($template->getThumbnailUrl());
        $dto->setColors($template->getColors());
        $dto->setCollageUrl($template->getCollageUrl());
        $dto->setSort($template->getSort());
        $dto->setUsageCount($template->getUsageCount());
        $dto->setIsOfficial(OfficialOrganizationUtil::isOfficialOrganization($template->getOrganizationCode()));
        $dto->setTags(array_map(
            static fn ($tag) => SlidesTemplateTagAssembler::createSimplePublicItemDTO($tag),
            $template->getTags()
        ));
        return $dto;
    }

    public static function createPublicDetailDTO(SlidesTemplateEntity $template): SlidesTemplatePublicDetailDTO
    {
        $dto = new SlidesTemplatePublicDetailDTO();
        $dto->setCode($template->getCode());
        $dto->setSourceType($template->getSourceType()->value);
        $dto->setCategoryCode($template->getCategoryCode());
        $dto->setLabel(I18nTextDTO::fromArray($template->getLabel()));
        $dto->setDescription(I18nTextDTO::fromArray($template->getDescription()));
        $dto->setThumbnailUrl($template->getThumbnailUrl());
        $dto->setColors($template->getColors());
        $dto->setCollageUrl($template->getCollageUrl());
        $dto->setPreviewImageUrls($template->getPreviewImageUrls());
        $dto->setPreviewUrl($template->getPreviewUrl());
        $dto->setSort($template->getSort());
        $dto->setUsageCount($template->getUsageCount());
        $dto->setIsOfficial(OfficialOrganizationUtil::isOfficialOrganization($template->getOrganizationCode()));
        $dto->setTags(array_map(
            static fn ($tag) => SlidesTemplateTagAssembler::createSimplePublicItemDTO($tag),
            $template->getTags()
        ));
        return $dto;
    }

    public static function createCountDTO(int $total, int $totalUsageCount = 0, int $templateCountTodayGrowth = 0): SlidesTemplateCountDTO
    {
        return new SlidesTemplateCountDTO($total, $totalUsageCount, $templateCountTodayGrowth);
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
        $dto->setColors($template->getColors());
        $dto->setCollageUrl($template->getCollageUrl());
        $dto->setPreviewImageUrls($template->getPreviewImageUrls());
        $dto->setPreviewUrl($template->getPreviewUrl());
        $dto->setSort($template->getSort());
        $dto->setUsageCount($template->getUsageCount());
        $dto->setIsOfficial(OfficialOrganizationUtil::isOfficialOrganization($template->getOrganizationCode()));
        $dto->setTags(array_map(
            static fn ($tag) => SlidesTemplateTagAssembler::createSimplePublicItemDTO($tag),
            $template->getTags()
        ));
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
