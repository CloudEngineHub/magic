<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Skill\Crontab;

use App\Application\SuperMagic\Skill\Service\AdminSkillAppService;
use App\Domain\SuperMagic\Skill\Service\SkillMarketVectorIndexDomainService;
use App\Infrastructure\Core\Traits\HasLogger;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use Hyperf\Crontab\Annotation\Crontab;
use Throwable;

#[Crontab(
    rule: '0 3 * * *',
    name: 'SkillMarketVectorIndexDailySyncCrontab',
    singleton: true,
    mutexExpires: 3600,
    onOneServer: true,
    callback: 'execute',
    memo: '每日补偿同步 Skill 市场向量索引',
)]
final class SkillMarketVectorIndexDailySyncCrontab
{
    use HasLogger;

    public function __construct(
        private readonly AdminSkillAppService $skillAppService,
        private readonly SkillMarketVectorIndexDomainService $vectorIndexDomainService,
    ) {
    }

    public function execute(): void
    {
        $organizationCode = OfficialOrganizationUtil::getOfficialOrganizationCode();
        if ($organizationCode === '') {
            $this->logger->warning('Skill market vector daily sync skipped because official organization is not configured');
            return;
        }

        $removed = 0;
        try {
            $removed = $this->vectorIndexDomainService->removeOrphanPoints();
        } catch (Throwable $throwable) {
            $this->logger->error('Skill market orphan vector cleanup failed', [
                'organization_code' => $organizationCode,
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
        }

        $queued = 0;
        try {
            $result = $this->skillAppService->reindexAllMarketVectors($organizationCode, 'system');
            $queued = $result['queued'] ?? 0;
        } catch (Throwable $throwable) {
            $this->logger->error('Skill market vector daily sync failed', [
                'organization_code' => $organizationCode,
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
        }

        $this->logger->info('Skill market vector daily sync finished', [
            'organization_code' => $organizationCode,
            'removed_orphans' => $removed,
            'queued' => $queued,
        ]);
    }
}
