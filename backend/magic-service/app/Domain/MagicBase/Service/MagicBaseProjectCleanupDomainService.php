<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Repository\Facade\MagicBaseMetadataCleanupRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowCleanupRepositoryInterface;

readonly class MagicBaseProjectCleanupDomainService
{
    public function __construct(
        private MagicBaseRowCleanupRepositoryInterface $rowCleanupRepository,
        private MagicBaseMetadataCleanupRepositoryInterface $metadataCleanupRepository,
    ) {
    }

    public function deleteProjectData(string $organizationCode, int $projectId): void
    {
        $this->rowCleanupRepository->deleteProjectRows($organizationCode, $projectId);
        $this->metadataCleanupRepository->deleteProjectMetadata($organizationCode, $projectId);
    }
}
