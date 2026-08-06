<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO\Response;

use App\Interfaces\MagicBase\DTO\AbstractMagicBaseDTO;

class MagicBaseRowPermissionResponseDTO extends AbstractMagicBaseDTO
{
    protected int|string $id = '';

    protected int|string $tableId = '';

    protected int|string $recordId = '';

    protected string $subjectType = '';

    protected int|string $subjectId = '';

    protected bool $canRead = false;

    protected bool $canEdit = false;

    protected bool $canDelete = false;
}
