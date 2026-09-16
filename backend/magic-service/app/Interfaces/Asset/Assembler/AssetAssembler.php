<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Asset\Assembler;

use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Entity\AssetTagEntity;
use App\Domain\Asset\Entity\ValueObject\AssetComplianceStatus;
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
    public static function createTagList(array $tags): array
    {
        return array_map(static fn (AssetTagEntity $tag): array => self::createTagItem($tag), $tags);
    }

    public static function createTagItem(AssetTagEntity $tag): array
    {
        return [
            'id' => (string) $tag->getId(),
            'parentId' => (string) $tag->getParentId(),
            'nodeType' => $tag->getNodeType()->value,
            'name' => (string) ($tag->getNameI18n()['default'] ?? ''),
            'ownerUid' => $tag->getOwnerUid(),
            'isOfficial' => $tag->getOwnerUid() === null,
        ];
    }

    public static function createOwnerList(array $owners): array
    {
        return array_map(static fn (array $owner): array => [
            'id' => (string) ($owner['id'] ?? ''),
            'name' => (string) ($owner['name'] ?? ''),
        ], $owners);
    }

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
        // 合规结论对用户端与管理端都要给；失败原因只在未通过时回填，通过/未校验时保持为空。
        $complianceStatus = AssetComplianceStatus::forAsset($entity->getAssetKind(), $entity->getSyncStatus());
        $dto->setComplianceStatus($complianceStatus->value);
        $dto->setComplianceFailedReason($complianceStatus->isFailed() ? $entity->getSyncFailedReason() : null);
        $ownerUid = $entity->getOwnerUid() ?: $entity->getUserId();
        $dto->setOwner($ownerUid, $entity->getOwnerName());
        $dto->setOwnerUid($ownerUid);
        $dto->setSource($entity->getSource());
        $dto->setTags($entity->getTags());
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
