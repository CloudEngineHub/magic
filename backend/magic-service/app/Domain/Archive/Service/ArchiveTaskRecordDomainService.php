<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Archive\Service;

use App\Domain\Archive\Entity\ValueObject\ArchiveMode;
use App\Domain\Archive\Entity\ValueObject\ArchiveStatus;
use App\Domain\Archive\Repository\Facade\ArchiveTaskRecordRepositoryInterface;

final readonly class ArchiveTaskRecordDomainService
{
    public function __construct(
        private ArchiveTaskRecordRepositoryInterface $repository,
    ) {
    }

    public function startFullArchive(string $archiveType, string $statDate): void
    {
        $this->repository->markRunning($archiveType, $statDate, ArchiveMode::Full);
    }

    /**
     * @param array{source_count: int, target_count: int, source_start_id: string, source_end_id: string, completed_bucket_count: int} $result
     */
    public function complete(string $archiveType, string $statDate, array $result): void
    {
        $this->repository->markFinished(
            $archiveType,
            $statDate,
            ArchiveStatus::Success,
            $result['target_count'],
            $result['source_start_id'],
            $result['source_end_id'],
            [
                'source_count' => $result['source_count'],
                'target_count' => $result['target_count'],
                'completed_bucket_count' => $result['completed_bucket_count'],
            ]
        );
    }

    public function fail(string $archiveType, string $statDate, string $errorMessage): void
    {
        $this->repository->markFinished(
            $archiveType,
            $statDate,
            ArchiveStatus::Failed,
            0,
            '',
            '',
            ['error_message' => $errorMessage]
        );
    }

}
