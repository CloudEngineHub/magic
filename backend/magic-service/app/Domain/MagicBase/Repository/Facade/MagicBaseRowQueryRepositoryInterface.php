<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;

interface MagicBaseRowQueryRepositoryInterface
{
    public function getRow(string $organizationCode, int $tableId, int $recordId): ?MagicBaseRowEntity;

    /** @return MagicBaseEntityCollection<MagicBaseRowEntity> */
    public function listRows(string $organizationCode, int $tableId, bool $includeDeleted = false): MagicBaseEntityCollection;
}
