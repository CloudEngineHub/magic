<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

use App\Infrastructure\Core\AbstractEntity;

class SelectQuery extends AbstractEntity
{
    /** @var list<string> */
    protected array $fields = [];

    /** @var array<string, array{source_column?: string, fields?: list<string>}> */
    protected array $relations = [];

    /**
     * @return list<string>
     */
    public function getFields(): array
    {
        return $this->fields;
    }

    /**
     * @param list<string> $fields
     */
    public function setFields(array $fields): void
    {
        $this->fields = array_values(array_filter($fields, 'is_string'));
    }

    /**
     * @return array<string, array{source_column?: string, fields?: list<string>}>
     */
    public function getRelations(): array
    {
        return $this->relations;
    }

    /**
     * @param array<string, array{source_column?: string, fields?: list<string>}> $relations
     */
    public function setRelations(array $relations): void
    {
        $this->relations = $relations;
    }
}
