<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO;

class CreateRowRequest extends AbstractMagicBaseDTO
{
    protected array $data = [];

    protected string $select = '';

    /** @return array<string, mixed> Dynamic row values keyed by MagicBase column_key. */
    public function getData(): array
    {
        return $this->data;
    }

    public function setData(null|array|string $value): void
    {
        $this->data = is_string($value) ? (json_decode($value, true) ?: []) : (is_array($value) ? $value : []);
    }

    public function getSelect(): string
    {
        return $this->select;
    }

    public function setSelect(null|int|string $value): void
    {
        $this->select = $value === null ? '' : (string) $value;
    }
}
