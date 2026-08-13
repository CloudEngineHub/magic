<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseColumnDynamicPermission
{
    public function __construct(
        private string $readScope,
        private string $editScope,
    ) {
    }

    /**
     * @param null|array{read_scope?: string, edit_scope?: string} $payload
     */
    public static function fromArray(?array $payload): self
    {
        $payload ??= [];
        return new self(
            (string) ($payload['read_scope'] ?? MagicBaseConst::DEFAULT_COLUMN_PERMISSIONS['read_scope']),
            (string) ($payload['edit_scope'] ?? MagicBaseConst::DEFAULT_COLUMN_PERMISSIONS['edit_scope']),
        );
    }

    public function getReadScope(): string
    {
        return $this->readScope;
    }

    public function getEditScope(): string
    {
        return $this->editScope;
    }

    /**
     * @return array{read_scope: string, edit_scope: string}
     */
    public function toArray(): array
    {
        return [
            'read_scope' => $this->readScope,
            'edit_scope' => $this->editScope,
        ];
    }
}
