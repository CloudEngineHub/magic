<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;

readonly class MagicBaseTableDetailDTO
{
    public function __construct(
        public MagicBaseTableEntity $table,
        public MagicBaseEntityCollection $columns,
    ) {
    }
}
