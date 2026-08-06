<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

use App\Domain\MagicBase\Entity\MagicBaseMigrationLogEntity;

interface MagicBaseMigrationLogRepositoryInterface
{
    public function createMigrationLog(MagicBaseMigrationLogEntity $entity): MagicBaseMigrationLogEntity;
}
