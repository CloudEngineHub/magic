<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Provider\DTO;

class ProviderModelProviderDTO
{
    public function __construct(
        public string $serviceProviderConfigId,
        public string $providerCode,
        public string $name,
        public string $alias,
        public int $status,
        public string $icon,
        public ?string $modelRecordId = null,
        public ?int $modelStatus = null,
    ) {
    }
}
