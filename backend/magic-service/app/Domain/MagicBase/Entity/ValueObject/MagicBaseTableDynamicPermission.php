<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseTableDynamicPermission
{
    public function __construct(
        private string $readScope,
        private string $insertScope,
    ) {
    }

    /**
     * @param null|array{read_scope?: string, insert_scope?: string} $payload
     */
    public static function fromArray(?array $payload): self
    {
        $payload ??= [];
        return new self(
            (string) ($payload['read_scope'] ?? MagicBaseConst::DEFAULT_TABLE_PERMISSIONS['read_scope']),
            (string) ($payload['insert_scope'] ?? MagicBaseConst::DEFAULT_TABLE_PERMISSIONS['insert_scope']),
        );
    }

    public function getReadScope(): string
    {
        return $this->readScope;
    }

    public function getInsertScope(): string
    {
        return $this->insertScope;
    }

    /**
     * @return array{read_scope: string, insert_scope: string}
     */
    public function toArray(): array
    {
        return [
            'read_scope' => $this->readScope,
            'insert_scope' => $this->insertScope,
        ];
    }
}
