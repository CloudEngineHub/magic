<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Audit\ModelCall\Service;

use App\Domain\Archive\Service\ArchiveTaskRecordDomainService;
use App\Domain\Audit\ModelCall\Service\AuditHourlyRecordDomainService;
use App\Infrastructure\Core\Traits\HasLogger;
use DateTimeImmutable;
use DateTimeZone;
use Hyperf\DbConnection\Db;
use InvalidArgumentException;
use Throwable;

use function Hyperf\Config\config;

final class ModelAuditHourlyArchiveService
{
    use HasLogger;

    private const ARCHIVE_TYPE = 'model_audit_hourly';

    public function __construct(
        private readonly AuditHourlyRecordDomainService $auditHourlyRecordDomainService,
        private readonly ArchiveTaskRecordDomainService $archiveTaskRecordDomainService,
    ) {
    }

    /**
     * @return array{total: int, success: int, failed: int, failed_dates: list<string>}
     */
    public function archiveRange(string $startDate, string $endDate): array
    {
        $start = $this->parseDate($startDate);
        $end = $this->parseDate($endDate);
        $today = new DateTimeImmutable('today', $this->timezone());

        if ($start > $end) {
            throw new InvalidArgumentException('start-date cannot be later than end-date');
        }
        if ($end >= $today) {
            throw new InvalidArgumentException('end-date must be earlier than today');
        }

        $result = ['total' => 0, 'success' => 0, 'failed' => 0, 'failed_dates' => []];
        for ($date = $start; $date <= $end; $date = $date->modify('+1 day')) {
            $statDate = $date->format('Y-m-d');
            ++$result['total'];
            try {
                $archiveResult = $this->archiveDate($statDate);
                ++$result['success'];
            } catch (Throwable $throwable) {
                ++$result['failed'];
                $result['failed_dates'][] = $statDate;
                $this->markFailed($statDate, $throwable);
            }
        }

        return $result;
    }

    /**
     * @return array{source_count: int, target_count: int, source_start_id: string, source_end_id: string, completed_bucket_count: int}
     */
    public function archiveDate(string $statDate): array
    {
        $this->parseDate($statDate);
        $this->archiveTaskRecordDomainService->startFullArchive(self::ARCHIVE_TYPE, $statDate);

        return Db::transaction(function () use ($statDate): array {
            $result = $this->auditHourlyRecordDomainService->rebuildDate($statDate);
            $this->archiveTaskRecordDomainService->complete(self::ARCHIVE_TYPE, $statDate, $result);
            return $result;
        });
    }

    private function parseDate(string $date): DateTimeImmutable
    {
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date, $this->timezone());
        if (! $parsed || $parsed->format('Y-m-d') !== $date) {
            throw new InvalidArgumentException('date must use YYYY-MM-DD format');
        }
        return $parsed;
    }

    private function markFailed(string $statDate, Throwable $throwable): void
    {
        try {
            $this->archiveTaskRecordDomainService->fail(
                self::ARCHIVE_TYPE,
                $statDate,
                $throwable->getMessage()
            );
        } catch (Throwable $statusThrowable) {
            $this->logger->error('Model audit archive status update failed', [
                'stat_date' => $statDate,
                'archive_error' => $throwable->getMessage(),
                'status_error' => $statusThrowable->getMessage(),
            ]);
        }
    }

    private function timezone(): DateTimeZone
    {
        return new DateTimeZone((string) config('app.default_timezone', 'Asia/Shanghai'));
    }
}
