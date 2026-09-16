<?php

declare(strict_types=1);

namespace App\Interfaces\Asset\Assembler;

use App\Domain\Asset\Entity\AssetTagEntity;

final class AssetTagAssembler
{
    /** @param AssetTagEntity[] $tags */
    public static function toList(array $tags): array
    {
        return array_map(static fn (AssetTagEntity $tag): array => self::toItem($tag), $tags);
    }

    public static function toItem(AssetTagEntity $tag): array
    {
        return [
            'id' => (string) $tag->getId(),
            'parentId' => (string) $tag->getParentId(),
            'nodeType' => $tag->getNodeType(),
            'name' => (string) ($tag->getNameI18n()['default'] ?? ''),
            'ownerUid' => $tag->getOwnerUid(),
            'isOfficial' => $tag->getOwnerUid() === null,
        ];
    }
}
