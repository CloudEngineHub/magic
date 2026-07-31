<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Provider\DTO;

class ProviderModelRecordDTO
{
    public function __construct(
        public string $id,
        public string $modelId,
        public string $name,
        public string $modelVersion,
        public string $category,
        public int $modelType,
        public int $status,
        public string $icon,
        public ProviderModelProviderDTO $provider,
    ) {
    }
}
