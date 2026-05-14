<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

class MagicBaseAccessContext
{
    public function __construct(
        private readonly MagicBaseColumnIndex $columns,
        private readonly MagicBaseEntityCollection $tablePermissions,
        private readonly MagicBaseEntityCollection $projectAdmins,
        private readonly MagicBaseEntityCollection $tableAdmins,
        private readonly MagicBasePermissionIndex $columnPermissions,
        private readonly MagicBasePermissionIndex $rowPermissions,
        private readonly bool $manager,
    ) {
    }

    public function getColumns(): MagicBaseColumnIndex
    {
        return $this->columns;
    }

    public function getTablePermissions(): MagicBaseEntityCollection
    {
        return $this->tablePermissions;
    }

    public function getProjectAdmins(): MagicBaseEntityCollection
    {
        return $this->projectAdmins;
    }

    public function getTableAdmins(): MagicBaseEntityCollection
    {
        return $this->tableAdmins;
    }

    public function getColumnPermissions(int $columnId): MagicBaseEntityCollection
    {
        return $this->columnPermissions->get($columnId);
    }

    public function getRowPermissions(int $recordId): MagicBaseEntityCollection
    {
        return $this->rowPermissions->get($recordId);
    }

    /**
     * @return array<int, MagicBaseEntityCollection>
     */
    public function getRowPermissionsByRecord(): array
    {
        return $this->rowPermissions->all();
    }

    public function isManager(): bool
    {
        return $this->manager;
    }
}
