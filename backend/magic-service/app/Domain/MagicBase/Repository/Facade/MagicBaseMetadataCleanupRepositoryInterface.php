<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

interface MagicBaseMetadataCleanupRepositoryInterface
{
    public function deleteProjectMetadata(string $organizationCode, int $projectId): void;
}
