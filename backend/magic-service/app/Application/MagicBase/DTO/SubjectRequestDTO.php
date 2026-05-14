<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class SubjectRequestDTO
{
    public function __construct(
        private ?string $subjectType = null,
        private null|int|string $subjectId = null,
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
        );
    }

    public function getSubjectType(): ?string
    {
        return $this->subjectType;
    }

    public function getSubjectId(): null|int|string
    {
        return $this->subjectId;
    }

    /**
     * @return array{subject_type?: string, subject_id?: null|int|string}
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
        return $payload;
    }
}
