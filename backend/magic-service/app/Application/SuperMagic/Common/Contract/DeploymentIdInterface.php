<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Common\Contract;

interface DeploymentIdInterface
{
    public function isPrivateDeployment(): bool;

    public function isSaaSCommercialRuntime(): bool;

    public function isDomesticSaaS(): bool;
}
