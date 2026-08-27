<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Crontab;

use App\Application\SlidesTemplate\Service\AdminSlidesTemplateAppService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Service\SlidesTemplateVectorIndexDomainService;
use App\Infrastructure\Core\Traits\HasLogger;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use Hyperf\Crontab\Annotation\Crontab;
use Throwable;

#[Crontab(
    rule: '0 3 * * *',
    name: 'SlidesTemplateVectorIndexDailySyncCrontab',
    singleton: true,
    mutexExpires: 3600,
    onOneServer: true,
    callback: 'execute',
    memo: '每日补偿同步幻灯片模板向量索引',
)]
final class SlidesTemplateVectorIndexDailySyncCrontab
{
    use HasLogger;

    public function __construct(
        private readonly AdminSlidesTemplateAppService $slidesTemplateAppService,
        private readonly SlidesTemplateVectorIndexDomainService $vectorIndexDomainService,
    ) {
    }

    public function execute(): void
    {
        $organizationCode = OfficialOrganizationUtil::getOfficialOrganizationCode();
        if ($organizationCode === '') {
            $this->logger->warning('Slides template vector daily sync skipped because official organization is not configured');
            return;
        }

        $removed = 0;
        try {
            $dataIsolation = new SlidesTemplateDataIsolation();
            $dataIsolation->setCurrentOrganizationCode($organizationCode);
            $dataIsolation->setCurrentUserId('system');
            $dataIsolation->setOfficialOrganizationCodes([$organizationCode]);
            $dataIsolation->setContainOfficialOrganization(true);
            $removed = $this->vectorIndexDomainService->removeOrphanPoints($dataIsolation, $organizationCode);
        } catch (Throwable $throwable) {
            $this->logger->error('Slides template orphan vector cleanup failed', [
                'organization_code' => $organizationCode,
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
        }

        $queued = 0;
        try {
            $result = $this->slidesTemplateAppService->reindexOfficialVectorIndex(
                $organizationCode,
                forceReEmbedding: false,
            );
            $queued = $result['queued'] ?? 0;
        } catch (Throwable $throwable) {
            $this->logger->error('Slides template vector daily sync failed', [
                'organization_code' => $organizationCode,
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
        }

        $this->logger->info('Slides template vector daily sync finished', [
            'organization_code' => $organizationCode,
            'removed_orphans' => $removed,
            'queued' => $queued,
        ]);
    }
}
