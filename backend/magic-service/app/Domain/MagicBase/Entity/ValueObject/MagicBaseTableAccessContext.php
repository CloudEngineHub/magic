<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

use App\Domain\MagicBase\Entity\MagicBaseTableEntity;

readonly class MagicBaseTableAccessContext
{
    public function __construct(
        private int $projectId,
        private int $tableId,
        private ActorContext $actor,
        private MagicBaseTableEntity $table,
        private MagicBaseAccessContext $access,
    ) {
    }

    public function getProjectId(): int
    {
        return $this->projectId;
    }

    public function getTableId(): int
    {
        return $this->tableId;
    }

    public function getActor(): ActorContext
    {
        return $this->actor;
    }

    public function getTable(): MagicBaseTableEntity
    {
        return $this->table;
    }

    public function getAccess(): MagicBaseAccessContext
    {
        return $this->access;
    }
}
