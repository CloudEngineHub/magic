<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ResourceAccess\Repository\Facade;

use App\Domain\Audit\ResourceAccess\Entity\ResourceAccessLogEntity;

interface ResourceAccessLogRepositoryInterface
{
    public function save(ResourceAccessLogEntity $entity): ResourceAccessLogEntity;
}
