<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseMigrationLogEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Infrastructure\Util\Context\CoContext;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use DateTime;

readonly class MagicBaseMigrationLogDomainService
{
    public function buildPayload(
        MagicUserAuthorization $authorization,
        int $projectId,
        ?int $tableId,
        string $changeType,
        string $targetType,
        ?int $targetId,
        mixed $before,
        mixed $after,
    ): MagicBaseMigrationLogEntity {
        return new MagicBaseMigrationLogEntity([
            'organization_code' => $authorization->getOrganizationCode(),
            'project_id' => $projectId,
            'table_id' => $tableId,
            'change_type' => $changeType,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'source_type' => MagicBaseConst::SOURCE_MANUAL,
            'source_ref' => MagicBaseConst::SOURCE_REF_API,
            'before_json' => $before,
            'after_json' => $after,
            'operator_id' => $authorization->getId(),
            'operator_name' => $authorization->getRealName() !== '' ? $authorization->getRealName() : $authorization->getNickname(),
            'request_id' => CoContext::getRequestId(),
            'remark' => null,
            'created_at' => new DateTime(),
        ]);
    }
}
