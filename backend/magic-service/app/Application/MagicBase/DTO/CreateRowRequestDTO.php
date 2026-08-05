<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

class CreateRowRequestDTO
{
    /**
     * @param array<string, mixed> $data dynamic row values keyed by MagicBase column_key
     */
    public function __construct(
        public array $data,
        public string $select = '',
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function getData(): array
    {
        return $this->data;
    }

    public function getSelect(): string
    {
        return $this->select;
    }

    /**
     * @return array{data: array<string, mixed>, select: string}
     */
    public function toArray(): array
    {
        return [
            'data' => $this->data,
            'select' => $this->select,
        ];
    }
}
