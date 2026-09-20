<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Archive\Repository\Persistence;

use App\Domain\Archive\Entity\ValueObject\ArchiveMode;
use App\Domain\Archive\Entity\ValueObject\ArchiveStatus;
use App\Domain\Archive\Repository\Facade\ArchiveTaskRecordRepositoryInterface;
use App\Domain\Archive\Repository\Persistence\Model\ArchiveTaskRecordModel;

final class ArchiveTaskRecordRepository implements ArchiveTaskRecordRepositoryInterface
{
    public function markRunning(string $archiveType, string $statDate, ArchiveMode $archiveMode): void
    {
        $attributes = [
            'archive_mode' => $archiveMode->value,
            'status' => ArchiveStatus::Running->value,
            'started_at' => date('Y-m-d H:i:s'),
            'finished_at' => null,
        ];
        if ($archiveMode === ArchiveMode::Full) {
            $attributes += [
                'archived_count' => 0,
                'source_start_id' => '',
                'source_end_id' => '',
                'extra' => null,
            ];
        }

        ArchiveTaskRecordModel::query()->updateOrCreate(
            ['archive_type' => $archiveType, 'stat_date' => $statDate],
            $attributes
        );
    }

    public function markFinished(
        string $archiveType,
        string $statDate,
        ArchiveStatus $status,
        int $archivedCount,
        string $sourceStartId,
        string $sourceEndId,
        array $extra
    ): void {
        $record = ArchiveTaskRecordModel::query()
            ->where('archive_type', $archiveType)
            ->where('stat_date', $statDate)
            ->first();

        if ($record !== null
            && $record->archive_mode === ArchiveMode::Incremental->value
        ) {
            if ($status === ArchiveStatus::Success) {
                $archivedCount += (int) $record->archived_count;
                $sourceStartId = $this->minId(
                    (string) $record->source_start_id,
                    $sourceStartId
                );
                $sourceEndId = $this->maxId(
                    (string) $record->source_end_id,
                    $sourceEndId
                );
            } else {
                $archivedCount = (int) $record->archived_count;
                $sourceStartId = (string) $record->source_start_id;
                $sourceEndId = (string) $record->source_end_id;
            }
        }

        ArchiveTaskRecordModel::query()->updateOrCreate(
            ['archive_type' => $archiveType, 'stat_date' => $statDate],
            [
                'status' => $status->value,
                'archived_count' => $archivedCount,
                'source_start_id' => $sourceStartId,
                'source_end_id' => $sourceEndId,
                'extra' => $extra,
                'finished_at' => date('Y-m-d H:i:s'),
            ]
        );
    }

    private function minId(string $left, string $right): string
    {
        if ($left === '') {
            return $right;
        }
        if ($right === '') {
            return $left;
        }
        return $this->compareIds($left, $right) <= 0 ? $left : $right;
    }

    private function maxId(string $left, string $right): string
    {
        if ($left === '') {
            return $right;
        }
        if ($right === '') {
            return $left;
        }
        return $this->compareIds($left, $right) >= 0 ? $left : $right;
    }

    private function compareIds(string $left, string $right): int
    {
        if (ctype_digit($left) && ctype_digit($right)) {
            $left = ltrim($left, '0') ?: '0';
            $right = ltrim($right, '0') ?: '0';
            return strlen($left) <=> strlen($right) ?: strcmp($left, $right);
        }

        return strcmp($left, $right);
    }
}
