<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Common\Contract;

final class DefaultDeploymentId implements DeploymentIdInterface
{
    public function isPrivateDeployment(): bool
    {
        return false;
    }

    public function isSaaSCommercialRuntime(): bool
    {
        return false;
    }

    public function isDomesticSaaS(): bool
    {
        return false;
    }
}
