<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ModelCall\Service;

use App\Domain\Audit\ModelCall\Entity\AuditLogEntity;
use App\Domain\Audit\ModelCall\Repository\Facade\AuditHourlyRecordRepositoryInterface;
use App\Domain\Audit\ModelCall\Repository\Facade\AuditLogRepositoryInterface;
use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;

use function Hyperf\Config\config;

/**
 * 模型调用审计领域服务：持久化与查询经此中转，不暴露仓储给 Application 层.
 */
readonly class ModelCallAuditDomainService
{
    public function __construct(
        private AuditLogRepositoryInterface $auditLogRepository,
        private AuditHourlyRecordRepositoryInterface $auditHourlyRecordRepository,
    ) {
    }

    public function record(AuditLogEntity $entity): void
    {
        $eventId = trim((string) ($entity->getEventId() ?? ''));
        if ($eventId !== '') {
            $this->auditLogRepository->createOrUpdateAuditByEventId($entity);

            return;
        }
        $this->auditLogRepository->create($entity);
    }

    public function recordPointsByEventId(string $eventId, int $points): void
    {
        $this->auditLogRepository->recordPointsByEventId($eventId, $points);
    }

    /**
     * @param array<string, mixed> $filters
     * @return array{list: array, next_cursor_id: ?string, prev_cursor_id: ?string, has_more: bool}
     */
    public function queries(
        int $pageSize,
        array $filters = [],
        string $currentOrganizationCode = '',
        bool $isOfficialOrganization = false,
        ?string $cursorId = null,
        string $direction = 'next'
    ): array {
        return $this->auditLogRepository->queries(
            $pageSize,
            $filters,
            $currentOrganizationCode,
            $isOfficialOrganization,
            $cursorId,
            $direction
        );
    }

    /**
     * @param array<string, mixed> $filters
     * @return array{summary: array, trend: array, breakdown: array}
     */
    public function statistics(
        array $filters,
        string $currentOrganizationCode,
        bool $isOfficialOrganization
    ): array {
        return $this->auditLogRepository->statistics(
            $filters,
            $currentOrganizationCode,
            $isOfficialOrganization
        );
    }

    /**
     * @return array{source_count: int, target_count: int, source_start_id: string, source_end_id: string, completed_bucket_count: int}
     */
    public function rebuildHourlyDate(string $statDate): array
    {
        $timezone = new DateTimeZone((string) config('app.default_timezone', 'Asia/Shanghai'));
        $dayStart = DateTimeImmutable::createFromFormat('!Y-m-d', $statDate, $timezone);
        if (! $dayStart || $dayStart->format('Y-m-d') !== $statDate) {
            throw new InvalidArgumentException('Invalid statistic date: ' . $statDate);
        }
        $dayEnd = $dayStart->modify('+1 day');

        $this->auditHourlyRecordRepository->deleteDate($statDate);

        $completedBucketCount = 0;
        for ($cursor = $dayStart; $cursor < $dayEnd; $cursor = $cursor->modify('+1 hour')) {
            $next = $cursor->modify('+1 hour');
            $this->auditHourlyRecordRepository->insertHour(
                $statDate,
                $cursor->format('Y-m-d H:00:00'),
                $cursor->getTimestamp() * 1000,
                $next->getTimestamp() * 1000
            );
            ++$completedBucketCount;
        }

        $summary = $this->auditHourlyRecordRepository->summarizeDate($statDate);

        return [
            'source_count' => $summary['source_count'],
            'target_count' => $summary['target_count'],
            'source_start_id' => '',
            'source_end_id' => '',
            'completed_bucket_count' => $completedBucketCount,
        ];
    }

    /**
     * @param array<string, mixed> $filters
     * @return array{summary: array, trend: array, breakdown: array}
     */
    public function statisticsFromHourlyRecords(
        array $filters,
        string $currentOrganizationCode,
        bool $isOfficialOrganization,
        bool $hourly
    ): array {
        $trend = $this->auditHourlyRecordRepository->trend(
            $filters,
            $currentOrganizationCode,
            $isOfficialOrganization,
            $hourly
        );
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
            'breakdown' => $this->auditHourlyRecordRepository->breakdown(
                $filters,
                $currentOrganizationCode,
                $isOfficialOrganization
            ),
        ];
    }
}
