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

    #[Crontab(rule: '*/5 * * * * *', name: 'MagicClawPermissionReconcile', singleton: true, mutexExpires: 600, onOneServer: true)]
    public function execute(): void
    {
        $this->service->execute();
    }

    #[Crontab(rule: '0 * * * * *', name: 'MagicClawPermissionDiscovery', singleton: true, mutexExpires: 600, onOneServer: true)]
    public function discover(): void
    {
        $this->service->discover();
    }
}
