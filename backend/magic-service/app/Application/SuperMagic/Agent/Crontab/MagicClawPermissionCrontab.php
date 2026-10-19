<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\Crontab;

use App\Application\SuperMagic\Agent\Service\MagicClawReconciliationAppService;
use Hyperf\Crontab\Annotation\Crontab;

class MagicClawPermissionCrontab
{
    public function __construct(private readonly MagicClawReconciliationAppService $service)
    {
    }

    // Events handle normal changes. These schedules only recover missed work.
    #[Crontab(rule: '0 */10 * * * *', name: 'MagicClawPermissionReconcile', singleton: true, mutexExpires: 600, onOneServer: true)]
    public function execute(): void
    {
        $this->service->execute();
    }

    #[Crontab(rule: '0 17 * * * *', name: 'MagicClawPermissionDiscovery', singleton: true, mutexExpires: 600, onOneServer: true)]
    public function discover(): void
    {
        $this->service->discover();
    }
}
