<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQuery;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQueryResult;

interface MagicBaseRowQueryRepositoryInterface
{
    public function getRow(string $dataOrganizationCode, int $projectId, int $tableId, int $recordId): ?MagicBaseRowEntity;

    public function queryRows(MagicBaseRowQuery $query): MagicBaseRowQueryResult;

    /** @return MagicBaseEntityCollection<MagicBaseRowEntity> */
    public function listRows(string $dataOrganizationCode, int $projectId, int $tableId, bool $includeDeleted = false): MagicBaseEntityCollection;
}
