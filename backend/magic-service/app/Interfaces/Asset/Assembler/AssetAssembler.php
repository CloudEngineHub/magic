<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Asset\Assembler;

use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Repository\Persistence\Model\AssetModel;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\Util\Context\CoContext;
use App\Interfaces\Asset\DTO\Response\AdminAssetDTO;
use App\Interfaces\Asset\DTO\Response\AdminDeleteAssetDTO;
use App\Interfaces\Asset\DTO\Response\AssetDTO;
use App\Interfaces\Asset\DTO\Response\AssetListDTO;
use App\Interfaces\Asset\DTO\Response\DeleteAssetDTO;
use Dtyq\CloudFile\Kernel\Struct\FileLink;

class AssetAssembler
{
    public static function createItem(AssetEntity|AssetModel $asset, ?FileLink $fileLink = null, bool $admin = false): AdminAssetDTO|AssetDTO
    {
        $entity = $asset instanceof AssetEntity ? $asset : new AssetEntity($asset->toArray());
        $dto = $admin ? new AdminAssetDTO() : new AssetDTO();
        $dto->setAssetId($entity->getId());
        $dto->setAssetKind($entity->getAssetKind()->value);
        $dto->setAssetBusinessType($entity->getAssetBusinessType());
        $dto->setAssetMediaType($entity->getAssetMediaType()?->value);
        $dto->setParentId($entity->getParentId());
        $dto->setName($entity->getI18nName(self::language()));
        $dto->setDescription($entity->getI18nDescription(self::language()));
        $dto->setFileUrl($fileLink?->getUrl() ?? $entity->getFileUrl());
        if ($admin) {
            $dto->setStatus($entity->getStatus()->value);
            $dto->setFileKey($entity->getFileKey());
        }
        return $dto;
    }

    public static function createList(array $assets, Page $page, int $total, array $fileLinks = [], bool $admin = false): AssetListDTO
    {
        $items = [];
        foreach ($assets as $asset) {
            if (! $asset instanceof AssetModel && ! $asset instanceof AssetEntity) {
                continue;
            }
            $assetId = $asset instanceof AssetEntity ? $asset->getId() : $asset->getKey();
            $items[] = self::createItem($asset, $fileLinks[(string) $assetId] ?? null, $admin);
        }
        return new AssetListDTO($page->getPage(), $page->getPageNum(), $total, $items);
    }

    public static function createDeleteDTO(int|string $assetId, bool $deleted, bool $admin = false): AdminDeleteAssetDTO|DeleteAssetDTO
    {
        return $admin
            ? new AdminDeleteAssetDTO($assetId, $deleted)
            : new DeleteAssetDTO($assetId, $deleted);
    }

    private static function language(): string
    {
        return CoContext::getLanguage();
    }
}
