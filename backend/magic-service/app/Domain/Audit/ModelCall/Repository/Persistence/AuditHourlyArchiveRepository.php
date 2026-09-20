<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ModelCall\Repository\Persistence;

use App\Domain\Audit\ModelCall\Entity\ValueObject\AuditStatus;
use App\Domain\Audit\ModelCall\Entity\ValueObject\AuditType;
use App\Domain\Audit\ModelCall\Repository\Facade\AuditHourlyArchiveRepositoryInterface;
use App\Domain\Audit\ModelCall\Repository\Persistence\Model\AuditHourlyRecordModel;
use App\Domain\Audit\ModelCall\Repository\Persistence\Model\AuditLogModel;
use Hyperf\DbConnection\Db;

final class AuditHourlyArchiveRepository implements AuditHourlyArchiveRepositoryInterface
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
}
