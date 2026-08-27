<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Crontab;

use App\Application\SlidesTemplate\Service\AdminSlidesTemplateAppService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Infrastructure\Core\Traits\HasLogger;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use Hyperf\Crontab\Annotation\Crontab;

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
    ) {
    }

    public function execute(): void
    {
        $organizationCode = OfficialOrganizationUtil::getOfficialOrganizationCode();
        if ($organizationCode === '') {
            $this->logger->warning('Slides template vector daily sync skipped because official organization is not configured');
            return;
        }

        $dataIsolation = new SlidesTemplateDataIsolation();
        $dataIsolation->setCurrentOrganizationCode($organizationCode);
        $dataIsolation->setCurrentUserId('system');
        $dataIsolation->setOfficialOrganizationCodes([$organizationCode]);
        $dataIsolation->setContainOfficialOrganization(true);
        $this->slidesTemplateAppService->reconcileVectorIndex($dataIsolation);
    }
}
