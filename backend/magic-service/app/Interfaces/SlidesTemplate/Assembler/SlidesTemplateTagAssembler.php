<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\Assembler;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateTagEntity;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use App\Interfaces\SlidesTemplate\DTO\Response\AdminSlidesTemplateTagItemDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\I18nTextDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateSimpleTagItemDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateTagItemDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateTagPageDTO;

class SlidesTemplateTagAssembler
{
    /**
     * @param SlidesTemplateTagEntity[] $tags
     */
    public static function createPageDTO(array $tags, Page $page, int $total, bool $admin): SlidesTemplateTagPageDTO
    {
        $list = array_map(
            static fn (SlidesTemplateTagEntity $tag): AdminSlidesTemplateTagItemDTO|SlidesTemplateTagItemDTO => $admin
                ? self::createAdminItemDTO($tag)
                : self::createPublicItemDTO($tag),
            $tags
        );

        return new SlidesTemplateTagPageDTO($page->getPage(), $page->getPageNum(), $total, $list);
    }

    public static function createPublicItemDTO(SlidesTemplateTagEntity $tag): SlidesTemplateTagItemDTO
    {
        $dto = new SlidesTemplateTagItemDTO();
        self::fillBase($dto, $tag);
        return $dto;
    }

    public static function createSimplePublicItemDTO(SlidesTemplateTagEntity $tag): SlidesTemplateSimpleTagItemDTO
    {
        $dto = new SlidesTemplateSimpleTagItemDTO();
        $dto->setId($tag->getId());
        $dto->setCode($tag->getCode());
        $dto->setNameI18n(I18nTextDTO::fromArray($tag->getNameI18n()));
        $dto->setSort($tag->getSort());
        return $dto;
    }

    public static function createAdminItemDTO(SlidesTemplateTagEntity $tag): AdminSlidesTemplateTagItemDTO
    {
        $dto = new AdminSlidesTemplateTagItemDTO();
        self::fillBase($dto, $tag);
        $dto->setOrganizationCode($tag->getOrganizationCode());
        $dto->setStatus($tag->getStatus()->value);
        $dto->setCreatedUid($tag->getCreatedUid());
        $dto->setUpdatedUid($tag->getUpdatedUid());
        $dto->setCreatedAt($tag->getCreatedAt());
        $dto->setUpdatedAt($tag->getUpdatedAt());
        return $dto;
    }

    private static function fillBase(SlidesTemplateTagItemDTO $dto, SlidesTemplateTagEntity $tag): void
    {
        $dto->setId($tag->getId());
        $dto->setCode($tag->getCode());
        $dto->setNameI18n(I18nTextDTO::fromArray($tag->getNameI18n()));
        $dto->setSort($tag->getSort());
        $dto->setTemplateCount($tag->getTemplateCount());
        $dto->setIsOfficial(OfficialOrganizationUtil::isOfficialOrganization($tag->getOrganizationCode()));
    }
}
