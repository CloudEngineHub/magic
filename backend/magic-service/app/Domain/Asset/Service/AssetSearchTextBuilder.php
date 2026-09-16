<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Service;

use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Entity\AssetTagEntity;

final class AssetSearchTextBuilder
{
    /** @param AssetTagEntity[] $tags */
    public function build(AssetEntity $asset, array $tags = []): string
    {
        $values = [$asset->getI18nName('default'), $asset->getI18nDescription('default')];
        foreach ($tags as $tag) {
            $values[] = $tag->getNameI18n()['default'] ?? '';
        }
        return trim(implode(' ', array_values(array_filter(
            $values,
            static fn (mixed $value): bool => is_string($value) && trim($value) !== '',
        ))));
    }
}
