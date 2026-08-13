<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseFilterCondition implements MagicBaseFilterNode
{
    public function __construct(
        private string $field,
        private string $operator,
        private mixed $value,
        private string $dataType,
    ) {
    }

    public function getField(): string
    {
        return $this->field;
    }

    public function getOperator(): string
    {
        return $this->operator;
    }

    public function getValue(): mixed
    {
        return $this->value;
    }

    public function getDataType(): string
    {
        return $this->dataType;
    }
}
