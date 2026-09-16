<?php

declare(strict_types=1);

namespace App\Interfaces\Asset\Assembler;

final class AssetOwnerAssembler
{
    public static function toList(array $owners): array
    {
        return array_values(array_map(static fn (array $owner): array => [
            'id' => (string) ($owner['id'] ?? ''),
            'name' => (string) ($owner['name'] ?? ''),
        ], $owners));
    }
}
