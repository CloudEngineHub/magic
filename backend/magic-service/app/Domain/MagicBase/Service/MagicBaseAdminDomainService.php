<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBasePermissionSubject;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;

readonly class MagicBaseAdminDomainService
{
    /**
     * @param array{subject_type?: string, subject_id?: null|int|string} $payload
     */
    public function normalizeSubjectPayload(array $payload, bool $allowAnonymous): MagicBasePermissionSubject
    {
        $subjectType = trim((string) ($payload['subject_type'] ?? ''));
        $subjectId = trim((string) ($payload['subject_id'] ?? ''));
        $allowed = $allowAnonymous ? MagicBaseConst::SUBJECT_TYPES : MagicBaseConst::MANAGEABLE_SUBJECT_TYPES;
        if (! in_array($subjectType, $allowed, true)) {
            $this->invalid('subject_type');
        }
        if ($subjectType !== MagicBaseConst::SUBJECT_ANONYMOUS && $subjectId === '') {
            MagicBaseExceptionBuilder::parameterMissing('subject_id');
        }

        return new MagicBasePermissionSubject($subjectType, $subjectId);
    }

    private function invalid(string $label): void
    {
        MagicBaseExceptionBuilder::permissionInvalid($label);
    }
}
