<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO\Response;

use App\Interfaces\MagicBase\DTO\AbstractMagicBaseDTO;

class MagicBaseColumnResponseDTO extends AbstractMagicBaseDTO
{
    protected int|string $id = '';

    protected int|string $tableId = '';

    protected string $columnKey = '';

    protected string $columnName = '';

    protected string $dataType = '';

    protected bool $isRequired = false;

    protected mixed $defaultValue = null;

    protected string $status = '';

    protected ?array $dynamicPermission = null;

    protected ?string $createdAt = null;

    protected ?string $updatedAt = null;
}
