<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\Listener;

use App\Application\SuperMagic\Agent\Service\MagicClawReconciliationAppService;
use App\Domain\Contact\Event\DepartmentMembershipChanged;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;

#[Listener]
class ClawDepartmentMembershipListener implements ListenerInterface
{
    public function __construct(private readonly MagicClawReconciliationAppService $service)
    {
    }

    public function listen(): array
    {
        return [DepartmentMembershipChanged::class];
    }

    public function process(object $event): void
    {
        if ($event instanceof DepartmentMembershipChanged) {
            // Synchronous: the durable work record joins the membership transaction.
            $this->service->requestReconciliation($event->organizationCode, 'membership_changed', true);
        }
    }
}
