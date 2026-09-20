<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ModelCall\Repository\Persistence;

use App\Domain\Audit\ModelCall\Repository\Facade\AuditHourlyRecordRepositoryInterface;
use App\Domain\Audit\ModelCall\Repository\Persistence\Model\AuditHourlyRecordModel;
use Hyperf\Database\Model\Builder;

final class AuditHourlyRecordRepository implements AuditHourlyRecordRepositoryInterface
{
    public function trend(
        array $filters,
        string $currentOrganizationCode,
        bool $isOfficialOrganization,
        bool $hourly
    ): array {
        $builder = $this->createStatisticsBuilder($filters, $currentOrganizationCode, $isOfficialOrganization);
        if ($hourly) {
            return $builder
                ->selectRaw(
                    'bucket_start_at as bucket_value,
                     SUM(request_count) as requests,
                     SUM(error_count) as errors,
                     SUM(input_tokens) as input_tokens,
                     SUM(output_tokens) as output_tokens,
                     SUM(total_tokens) as total_tokens'
                )
                ->groupBy('bucket_start_at')
                ->orderBy('bucket_start_at')
                ->get()
                ->toArray();
        }

        return $builder
            ->selectRaw(
                'stat_date as bucket_day,
                 SUM(request_count) as requests,
                 SUM(error_count) as errors,
                 SUM(input_tokens) as input_tokens,
                 SUM(output_tokens) as output_tokens,
                 SUM(total_tokens) as total_tokens'
            )
            ->groupBy('stat_date')
            ->orderBy('stat_date')
            ->get()
            ->toArray();
    }

    public function breakdown(array $filters, string $currentOrganizationCode, bool $isOfficialOrganization): array
    {
        $rows = $this->createStatisticsBuilder($filters, $currentOrganizationCode, $isOfficialOrganization)
            ->selectRaw(
                'service_provider_config_id,
                 product_code,
                 SUM(request_count) as total_requests,
                 SUM(error_count) as error_requests'
            )
            ->groupBy('service_provider_config_id', 'product_code')
            ->orderByDesc('total_requests')
            ->orderBy('service_provider_config_id')
            ->orderBy('product_code')
            ->get()
            ->toArray();

        foreach ($rows as &$row) {
            if ((string) ($row['service_provider_config_id'] ?? '') === '0') {
                $row['service_provider_config_id'] = '';
            }
        }
        unset($row);

        return $rows;
    }

    private function createStatisticsBuilder(
        array $filters,
        string $currentOrganizationCode,
        bool $isOfficialOrganization
    ): Builder {
        $builder = AuditHourlyRecordModel::query()
            ->where('bucket_start_at', '>=', (string) $filters['start_bucket_at'])
            ->where('bucket_start_at', '<', (string) $filters['end_bucket_at']);

        $organizationCode = $isOfficialOrganization
            ? trim((string) ($filters['organization_code'] ?? ''))
            : $currentOrganizationCode;
        if ($organizationCode !== '') {
            $builder->where('organization_code', $organizationCode);
        }
        $this->applyServiceProviderConfigFilter($builder, $filters);
        if (! empty($filters['product_code'])) {
            $builder->where('product_code', (string) $filters['product_code']);
        }
        if (! empty($filters['access_scope'])) {
            $builder->where('access_scope', (string) $filters['access_scope']);
        }

        return $builder;
    }

    private function applyServiceProviderConfigFilter(Builder $builder, array $filters): void
    {
        if (! array_key_exists('service_provider_config_ids', $filters)) {
            return;
        }

        $rawConfigIds = $filters['service_provider_config_ids'];
        $configIds = is_array($rawConfigIds) ? array_values(array_unique(array_filter(
            array_map('intval', $rawConfigIds),
            static fn (int $id): bool => $id > 0
        ))) : [];
        if ($configIds === []) {
            $builder->whereRaw('1 = 0');
            return;
        }
        $builder->whereIn('service_provider_config_id', $configIds);
    }
}
