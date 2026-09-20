<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ModelCall\Repository\Persistence;

use App\Domain\Audit\ModelCall\Entity\ValueObject\AuditStatus;
use App\Domain\Audit\ModelCall\Entity\ValueObject\AuditType;
use App\Domain\Audit\ModelCall\Repository\Facade\AuditHourlyRecordRepositoryInterface;
use App\Domain\Audit\ModelCall\Repository\Persistence\Model\AuditHourlyRecordModel;
use App\Domain\Audit\ModelCall\Repository\Persistence\Model\AuditLogModel;
use Hyperf\Database\Model\Builder;
use Hyperf\DbConnection\Db;

final class AuditHourlyRecordRepository implements AuditHourlyRecordRepositoryInterface
{
    public function deleteDate(string $statDate): void
    {
        AuditHourlyRecordModel::query()->where('stat_date', $statDate)->delete();
    }

    public function insertHour(string $statDate, string $bucketStartAt, int $startMs, int $endMs): void
    {
        $source = AuditLogModel::query()
            ->where('operation_time', '>=', $startMs)
            ->where('operation_time', '<', $endMs)
            ->whereNotIn('type', [
                AuditType::SEARCH->value,
                AuditType::WEB_SCRAPE->value,
                AuditType::SLIDES_TEMPLATE->value,
            ])
            ->selectRaw(
                "? as stat_date,
                 ? as bucket_start_at,
                 organization_code,
                 COALESCE(access_scope, '') as access_scope,
                 COALESCE(service_provider_config_id, 0) as service_provider_config_id,
                 COALESCE(product_code, '') as product_code,
                 COUNT(*) as request_count,
                 SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as error_count,
                 SUM(COALESCE(CAST(JSON_EXTRACT(`usage`, '$.prompt_tokens') AS UNSIGNED), 0)) as input_tokens,
                 SUM(COALESCE(CAST(JSON_EXTRACT(`usage`, '$.completion_tokens') AS UNSIGNED), 0)) as output_tokens,
                 SUM(COALESCE(CAST(JSON_EXTRACT(`usage`, '$.total_tokens') AS UNSIGNED),
                     COALESCE(CAST(JSON_EXTRACT(`usage`, '$.prompt_tokens') AS UNSIGNED), 0)
                         + COALESCE(CAST(JSON_EXTRACT(`usage`, '$.completion_tokens') AS UNSIGNED), 0), 0)) as total_tokens,
                 NOW() as created_at,
                 NOW() as updated_at",
                [$statDate, $bucketStartAt, AuditStatus::FAIL->value]
            )
            ->groupByRaw(
                "organization_code,
                 COALESCE(access_scope, ''),
                 COALESCE(service_provider_config_id, 0),
                 COALESCE(product_code, '')"
            );

        Db::table('magic_model_audit_hourly_records')->insertUsing([
            'stat_date',
            'bucket_start_at',
            'organization_code',
            'access_scope',
            'service_provider_config_id',
            'product_code',
            'request_count',
            'error_count',
            'input_tokens',
            'output_tokens',
            'total_tokens',
            'created_at',
            'updated_at',
        ], $source);
    }

    public function summarizeDate(string $statDate): array
    {
        $row = AuditHourlyRecordModel::query()
            ->where('stat_date', $statDate)
            ->selectRaw('COALESCE(SUM(request_count), 0) as source_count, COUNT(*) as target_count')
            ->first();

        return [
            'source_count' => (int) ($row?->source_count ?? 0),
            'target_count' => (int) ($row?->target_count ?? 0),
        ];
    }

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
