<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseRowDynamicPermission
{
    public function __construct(
        private string $readScope,
        private string $editScope,
        private string $deleteScope,
    ) {
    }

    /**
     * @param null|array{read_scope?: string, edit_scope?: string, delete_scope?: string} $payload
     */
    public static function fromArray(?array $payload): self
    {
        $payload ??= [];
        return new self(
            (string) ($payload['read_scope'] ?? MagicBaseConst::DEFAULT_ROW_PERMISSIONS['read_scope']),
            (string) ($payload['edit_scope'] ?? MagicBaseConst::DEFAULT_ROW_PERMISSIONS['edit_scope']),
            (string) ($payload['delete_scope'] ?? MagicBaseConst::DEFAULT_ROW_PERMISSIONS['delete_scope']),
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

    public function getDeleteScope(): string
    {
        return $this->deleteScope;
    }

    /**
     * @return array{read_scope: string, edit_scope: string, delete_scope: string}
     */
    public function toArray(): array
    {
        return [
            'read_scope' => $this->readScope,
            'edit_scope' => $this->editScope,
            'delete_scope' => $this->deleteScope,
        ];
    }
}
