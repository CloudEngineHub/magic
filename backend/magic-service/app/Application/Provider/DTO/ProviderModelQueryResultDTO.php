<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Provider\DTO;

class ProviderModelQueryResultDTO
{
    /**
     * @param array<ProviderModelGroupDTO|ProviderModelRecordDTO> $list
     */
    public function __construct(
        public int $page,
        public int $pageSize,
        public int $total,
        public array $list,
    ) {
    }
}
