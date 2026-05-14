<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class RowPermissionRequestDTO
{
    public function __construct(
        private null|int|string $recordId = null,
        private ?string $subjectType = null,
        private null|int|string $subjectId = null,
        private bool $canRead = false,
        private bool $canEdit = false,
        private bool $canDelete = false,
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            $payload['record_id'] ?? null,
            array_key_exists('subject_type', $payload) ? (string) $payload['subject_type'] : null,
            $payload['subject_id'] ?? null,
            (bool) ($payload['can_read'] ?? false),
            (bool) ($payload['can_edit'] ?? false),
            (bool) ($payload['can_delete'] ?? false),
        );
    }

    public function getRecordId(): null|int|string
    {
        return $this->recordId;
    }

    public function canRead(): bool
    {
        return $this->canRead;
    }

    public function canEdit(): bool
    {
        return $this->canEdit;
    }

    public function canDelete(): bool
    {
        return $this->canDelete;
    }

    /**
     * @return array{record_id?: null|int|string, subject_type?: string, subject_id?: null|int|string, can_read?: bool, can_edit?: bool, can_delete?: bool}
     */
    public function toArray(): array
    {
        $payload = [
            'can_read' => $this->canRead,
            'can_edit' => $this->canEdit,
            'can_delete' => $this->canDelete,
        ];
        if ($this->recordId !== null) {
            $payload['record_id'] = $this->recordId;
        }
        if ($this->subjectType !== null) {
            $payload['subject_type'] = $this->subjectType;
        }
        if ($this->subjectId !== null) {
            $payload['subject_id'] = $this->subjectId;
        }
        return $payload;
    }
}
