<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO\Response;

use App\Interfaces\MagicBase\DTO\AbstractMagicBaseDTO;

class MagicBasePageResponseDTO extends AbstractMagicBaseDTO
{
    protected int $page = 1;

    protected int $pageSize = 20;

    protected int $total = 0;

    protected bool $hasMore = false;

    protected array $list = [];
}
