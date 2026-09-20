<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ModelCall\Repository\Facade;

interface AuditHourlyRecordRepositoryInterface
{
    public function deleteDate(string $statDate): void;

    public function insertHour(string $statDate, string $bucketStartAt, int $startMs, int $endMs): void;

    /** @return array{source_count: int, target_count: int} */
    public function summarizeDate(string $statDate): array;

    /** @param array<string, mixed> $filters */
    public function trend(array $filters, string $currentOrganizationCode, bool $isOfficialOrganization, bool $hourly): array;

    /** @param array<string, mixed> $filters */
    public function breakdown(array $filters, string $currentOrganizationCode, bool $isOfficialOrganization): array;
}
