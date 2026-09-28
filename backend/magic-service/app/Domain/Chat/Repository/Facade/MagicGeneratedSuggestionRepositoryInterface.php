<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Chat\Repository\Facade;

use App\Domain\Chat\Entity\MagicGeneratedSuggestionEntity;
use App\Domain\Chat\Entity\ValueObject\GeneratedSuggestionStatus;

interface MagicGeneratedSuggestionRepositoryInterface
{
    public function findLatestEntityByTypeAndRelationId(int $type, int|string $relationId): ?MagicGeneratedSuggestionEntity;

    /**
     * 按唯一键写入追加问题状态。已有终态不被后到的上报覆盖。
     *
     * @param string[] $suggestions
     */
    public function saveReport(
        int $type,
        string $relationId,
        GeneratedSuggestionStatus $status,
        array $suggestions,
        ?string $createdUid,
    ): MagicGeneratedSuggestionEntity;
}
