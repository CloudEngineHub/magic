<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

use App\Domain\MagicBase\Entity\MagicBaseRowEntity;

interface MagicBaseRowStoreRepositoryInterface
{
    public function saveRow(MagicBaseRowEntity $entity): MagicBaseRowEntity;
}
