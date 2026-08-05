<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO\Response;

use App\Interfaces\MagicBase\DTO\AbstractMagicBaseDTO;

class MagicBaseAdminResponseDTO extends AbstractMagicBaseDTO
{
    protected int|string $id = '';

    protected null|int|string $projectId = null;

    protected null|int|string $tableId = null;

    protected string $subjectType = '';

    protected int|string $subjectId = '';
}
