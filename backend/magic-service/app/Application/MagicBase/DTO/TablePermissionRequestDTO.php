<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class TablePermissionRequestDTO
{
    public function __construct(
        private ?string $subjectType = null,
        private null|int|string $subjectId = null,
        private ?string $permissionLevel = null,
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            array_key_exists('subject_type', $payload) ? (string) $payload['subject_type'] : null,
            $payload['subject_id'] ?? null,
            array_key_exists('permission_level', $payload) ? (string) $payload['permission_level'] : null,
        );
    }

    public function getPermissionLevel(): ?string
    {
        return $this->permissionLevel;
    }

    /**
     * @return array{subject_type?: string, subject_id?: null|int|string, permission_level?: string}
     */
    public function toArray(): array
    {
        $payload = [];
        if ($this->subjectType !== null) {
            $payload['subject_type'] = $this->subjectType;
        }
        if ($this->subjectId !== null) {
            $payload['subject_id'] = $this->subjectId;
        }
        if ($this->permissionLevel !== null) {
            $payload['permission_level'] = $this->permissionLevel;
        }
        return $payload;
    }
}
