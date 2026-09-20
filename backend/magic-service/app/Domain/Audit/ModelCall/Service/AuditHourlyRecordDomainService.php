<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ModelCall\Service;

use App\Domain\Audit\ModelCall\Repository\Facade\AuditHourlyArchiveRepositoryInterface;
use App\Domain\Audit\ModelCall\Repository\Facade\AuditHourlyRecordRepositoryInterface;
use DateTimeImmutable;
use DateTimeZone;
use function Hyperf\Config\config;

final readonly class AuditHourlyRecordDomainService
{
    public function __construct(
        private AuditHourlyArchiveRepositoryInterface $archiveRepository,
        private AuditHourlyRecordRepositoryInterface $repository,
    ) {
    }

    /**
     * @return array{source_count: int, target_count: int, source_start_id: string, source_end_id: string, completed_bucket_count: int}
     */
    public function rebuildDate(string $statDate): array
    {
        $timezone = new DateTimeZone((string) config('app.default_timezone', 'Asia/Shanghai'));
        $dayStart = DateTimeImmutable::createFromFormat('!Y-m-d', $statDate, $timezone);
        if (! $dayStart || $dayStart->format('Y-m-d') !== $statDate) {
            throw new \InvalidArgumentException('Invalid statistic date: ' . $statDate);
        }
        $dayEnd = $dayStart->modify('+1 day');

        $this->archiveRepository->deleteDate($statDate);

        $completedBucketCount = 0;
        for ($cursor = $dayStart; $cursor < $dayEnd; $cursor = $cursor->modify('+1 hour')) {
            $next = $cursor->modify('+1 hour');
            $this->archiveRepository->insertHour(
                $statDate,
                $cursor->format('Y-m-d H:00:00'),
                $cursor->getTimestamp() * 1000,
                $next->getTimestamp() * 1000
            );
            ++$completedBucketCount;
        }

        $summary = $this->archiveRepository->summarizeDate($statDate);

        return [
            'source_count' => $summary['source_count'],
            'target_count' => $summary['target_count'],
            'source_start_id' => '',
            'source_end_id' => '',
            'completed_bucket_count' => $completedBucketCount,
        ];
    }

    /** @param array<string, mixed> $filters */
    public function statistics(
        array $filters,
        string $currentOrganizationCode,
        bool $isOfficialOrganization,
        bool $hourly
    ): array {
        $trend = $this->repository->trend($filters, $currentOrganizationCode, $isOfficialOrganization, $hourly);
        $summary = ['total' => 0, 'error' => 0, 'input_tokens' => 0, 'output_tokens' => 0, 'total_tokens' => 0];
        $timezone = $hourly ? new DateTimeZone((string) config('app.default_timezone', 'Asia/Shanghai')) : null;
        foreach ($trend as &$row) {
            $summary['total'] += (int) ($row['requests'] ?? 0);
            $summary['error'] += (int) ($row['errors'] ?? 0);
            $summary['input_tokens'] += (int) ($row['input_tokens'] ?? 0);
            $summary['output_tokens'] += (int) ($row['output_tokens'] ?? 0);
            $summary['total_tokens'] += (int) ($row['total_tokens'] ?? 0);
            unset($row['input_tokens'], $row['output_tokens'], $row['total_tokens']);
            if ($hourly) {
                $bucket = new DateTimeImmutable((string) $row['bucket_value'], $timezone);
                $row['bucket_ms'] = $bucket->getTimestamp() * 1000;
                unset($row['bucket_value']);
            }
        }
        unset($row);

        return [
            'summary' => $summary,
            'trend' => [
                'bucket_type' => $hourly ? 'hour' : 'day',
                'rows' => $trend,
                'start_ms' => (int) $filters['start_operation_time'],
                'end_ms' => (int) $filters['end_operation_time'],
            ],
            'breakdown' => $this->repository->breakdown($filters, $currentOrganizationCode, $isOfficialOrganization),
        ];
    }

}
