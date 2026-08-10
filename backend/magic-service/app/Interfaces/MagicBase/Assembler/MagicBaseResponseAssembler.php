<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\Assembler;

use App\Infrastructure\Core\AbstractEntity;
use App\Interfaces\MagicBase\DTO\Response\MagicBaseAdminResponseDTO;
use App\Interfaces\MagicBase\DTO\Response\MagicBaseColumnPermissionResponseDTO;
use App\Interfaces\MagicBase\DTO\Response\MagicBaseColumnResponseDTO;
use App\Interfaces\MagicBase\DTO\Response\MagicBasePageResponseDTO;
use App\Interfaces\MagicBase\DTO\Response\MagicBaseRelationResponseDTO;
use App\Interfaces\MagicBase\DTO\Response\MagicBaseRowPermissionResponseDTO;
use App\Interfaces\MagicBase\DTO\Response\MagicBaseRowResponseDTO;
use App\Interfaces\MagicBase\DTO\Response\MagicBaseTablePermissionResponseDTO;
use App\Interfaces\MagicBase\DTO\Response\MagicBaseTableResponseDTO;

class MagicBaseResponseAssembler
{
    public static function tableDetail(mixed $table, iterable $columns): MagicBaseTableResponseDTO
    {
        $payload = self::normalize($table);
        $payload['columns'] = array_map([self::class, 'column'], is_array($columns) ? $columns : iterator_to_array($columns));
        return new MagicBaseTableResponseDTO($payload);
    }

    public static function tableSummary(mixed $table): MagicBaseTableResponseDTO
    {
        return new MagicBaseTableResponseDTO(self::normalize($table));
    }

    public static function column(mixed $column): MagicBaseColumnResponseDTO
    {
        return new MagicBaseColumnResponseDTO(self::normalize($column));
    }

    public static function row(mixed $row): MagicBaseRowResponseDTO
    {
        return new MagicBaseRowResponseDTO(['payload' => self::normalize($row)]);
    }

    public static function page(mixed $payload): MagicBasePageResponseDTO
    {
        $payload = self::normalize($payload);
        $list = array_map(static function (mixed $item): mixed {
            if ($item instanceof MagicBaseRowResponseDTO) {
                return $item;
            }
            return self::row($item);
        }, $payload['list'] ?? []);

        return new MagicBasePageResponseDTO([
            'page' => (int) ($payload['page'] ?? 1),
            'page_size' => (int) ($payload['page_size'] ?? 20),
            'total' => (int) ($payload['total'] ?? 0),
            'has_more' => (bool) ($payload['has_more'] ?? false),
            'list' => $list,
        ]);
    }

    public static function relation(mixed $relation): MagicBaseRelationResponseDTO
    {
        return new MagicBaseRelationResponseDTO(self::normalize($relation));
    }

    public static function admin(mixed $payload): MagicBaseAdminResponseDTO
    {
        return new MagicBaseAdminResponseDTO(self::normalize($payload));
    }

    public static function tablePermission(mixed $payload): MagicBaseTablePermissionResponseDTO
    {
        return new MagicBaseTablePermissionResponseDTO(self::normalize($payload));
    }

    public static function columnPermission(mixed $payload): MagicBaseColumnPermissionResponseDTO
    {
        return new MagicBaseColumnPermissionResponseDTO(self::normalize($payload));
    }

    public static function rowPermission(mixed $payload): MagicBaseRowPermissionResponseDTO
    {
        return new MagicBaseRowPermissionResponseDTO(self::normalize($payload));
    }

    private static function normalize(mixed $payload): mixed
    {
        if ($payload instanceof AbstractEntity) {
            return $payload->toArray();
        }
        if (is_object($payload) && method_exists($payload, 'toArray')) {
            return $payload->toArray();
        }
        if (is_array($payload)) {
            return array_map([self::class, 'normalize'], $payload);
        }
        return $payload;
    }
}
