<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Common\DTO\Response;

class BatchGenerateIdResponseDTO
{
    /** @var string[] */
    public array $ids = [];

    public function toArray(): array
    {
        return [
            'ids' => $this->ids,
        ];
    }
}
