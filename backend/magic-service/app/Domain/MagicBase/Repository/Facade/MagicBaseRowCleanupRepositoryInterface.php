<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

interface MagicBaseRowCleanupRepositoryInterface
{
    public function deleteProjectRows(string $organizationCode, int $projectId): void;
}
