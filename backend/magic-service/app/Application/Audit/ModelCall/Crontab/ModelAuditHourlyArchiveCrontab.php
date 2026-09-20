<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Audit\ModelCall\Crontab;

use App\Application\Audit\ModelCall\Service\ModelAuditHourlyArchiveService;
use App\Infrastructure\Core\Traits\HasLogger;
use DateTimeImmutable;
use DateTimeZone;
use Hyperf\Crontab\Annotation\Crontab;
use Throwable;

use function Hyperf\Config\config;

#[Crontab(
    rule: '30 0 * * *',
    name: 'ModelAuditHourlyArchiveCrontab',
    singleton: true,
    mutexExpires: 3600,
    onOneServer: true,
    callback: 'execute',
    memo: '模型审计日志小时聚合归档'
)]
final class ModelAuditHourlyArchiveCrontab
{
    use HasLogger;

    public function __construct(
        private readonly ModelAuditHourlyArchiveService $archiveService,
    ) {
    }

    public function execute(): void
    {
        $yesterday = (new DateTimeImmutable('yesterday', new DateTimeZone((string) config('app.default_timezone', 'Asia/Shanghai'))))
            ->format('Y-m-d');
        try {
            $result = $this->archiveService->archiveRange($yesterday, $yesterday);
            if ($result['failed'] > 0) {
                $this->logger->error('Model audit hourly archive finished with failures', $result);
            } else {
                $this->logger->info('Model audit hourly archive finished', $result);
            }
        } catch (Throwable $throwable) {
            $this->logger->error('Model audit hourly archive failed', [
                'stat_date' => $yesterday,
                'error' => $throwable->getMessage(),
                'trace' => $throwable->getTraceAsString(),
            ]);
        }
    }
}
