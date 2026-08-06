<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

use App\Domain\MagicBase\Entity\MagicBaseColumnPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowPermissionEntity;
use App\Infrastructure\Core\AbstractEntity;

readonly class MagicBasePermissionIndex
{
    /**
     * @param array<int, MagicBaseEntityCollection> $permissionsByTargetId permission collections keyed by column_id or record_id
     */
    public function __construct(
        private array $permissionsByTargetId,
    ) {
    }

    public static function fromCollection(MagicBaseEntityCollection $permissions, string $targetField): self
    {
        $indexed = [];
        foreach ($permissions as $permission) {
            $targetId = self::resolveTargetId($permission, $targetField);
            $indexed[$targetId] ??= [];
            $indexed[$targetId][] = $permission;
        }

        foreach ($indexed as $targetId => $items) {
            $indexed[$targetId] = new MagicBaseEntityCollection($items);
        }

        return new self($indexed);
    }

    public function get(int $targetId): MagicBaseEntityCollection
    {
        return $this->permissionsByTargetId[$targetId] ?? new MagicBaseEntityCollection();
    }

    /**
     * @return array<int, MagicBaseEntityCollection<AbstractEntity>>
     */
    public function all(): array
    {
        return $this->permissionsByTargetId;
    }

    private static function resolveTargetId(mixed $permission, string $targetField): int
    {
        if ($permission instanceof MagicBaseColumnPermissionEntity && $targetField === 'column_id') {
            return (int) $permission->getColumnId();
        }

        if ($permission instanceof MagicBaseRowPermissionEntity && $targetField === 'record_id') {
            return (int) $permission->getRecordId();
        }

        return 0;
    }
}
