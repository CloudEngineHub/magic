<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;

interface MagicBaseTableRepositoryInterface
{
    public function getTable(string $organizationCode, int $projectId, int $tableId): ?MagicBaseTableEntity;

    public function getTableByKey(string $organizationCode, int $projectId, string $tableKey): ?MagicBaseTableEntity;

    /** @return MagicBaseEntityCollection<MagicBaseTableEntity> */
    public function listTables(string $organizationCode, int $projectId): MagicBaseEntityCollection;

    public function saveTable(MagicBaseTableEntity $entity): MagicBaseTableEntity;

    public function deleteTable(int $tableId): void;

    public function getColumn(string $organizationCode, int $tableId, int $columnId): ?MagicBaseColumnEntity;

    public function getColumnByKey(string $organizationCode, int $tableId, string $columnKey): ?MagicBaseColumnEntity;

    /** @return MagicBaseEntityCollection<MagicBaseColumnEntity> */
    public function listColumns(string $organizationCode, int $tableId): MagicBaseEntityCollection;

    public function saveColumn(MagicBaseColumnEntity $entity): MagicBaseColumnEntity;

    public function deleteColumn(int $columnId): void;
}
