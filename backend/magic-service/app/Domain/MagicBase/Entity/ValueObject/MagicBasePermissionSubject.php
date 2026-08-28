<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBasePermissionSubject
{
    public function __construct(
        private string $subjectType,
        private string $subjectId,
    ) {
    }

    public function getSubjectType(): string
    {
        return $this->subjectType;
    }

    public function getSubjectId(): string
    {
        return $this->subjectId;
    }

    /**
     * @return array{subject_type: string, subject_id: string}
     */
    public function toArray(): array
    {
        return [
            'subject_type' => $this->subjectType,
            'subject_id' => $this->subjectId,
        ];
    }
}
