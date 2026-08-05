<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO\Response;

use App\Interfaces\MagicBase\DTO\AbstractMagicBaseDTO;

class MagicBaseRelationResponseDTO extends AbstractMagicBaseDTO
{
    protected int|string $id = '';

    protected int|string $projectId = '';

    protected int|string $sourceTableId = '';

    protected string $sourceColumnKey = '';

    protected int|string $targetTableId = '';

    protected string $targetColumnKey = '';

    protected string $relationType = '';

    protected string $relationName = '';
}
