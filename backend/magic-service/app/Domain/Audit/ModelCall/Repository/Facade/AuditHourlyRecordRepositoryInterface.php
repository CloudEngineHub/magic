<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ModelCall\Repository\Facade;

interface AuditHourlyRecordRepositoryInterface
{
    /** @param array<string, mixed> $filters */
    public function trend(array $filters, string $currentOrganizationCode, bool $isOfficialOrganization, bool $hourly): array;

    /** @param array<string, mixed> $filters */
    public function breakdown(array $filters, string $currentOrganizationCode, bool $isOfficialOrganization): array;
}
