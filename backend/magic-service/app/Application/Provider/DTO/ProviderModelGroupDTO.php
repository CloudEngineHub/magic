<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Provider\DTO;

class ProviderModelGroupDTO
{
    /**
     * @param ProviderModelProviderDTO[] $providers
     */
    public function __construct(
        public string $modelId,
        public string $name,
        public string $category,
        public int $modelType,
        public string $icon,
        public int $providerCount,
        public array $providers,
    ) {
    }
}
