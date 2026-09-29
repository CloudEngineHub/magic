<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Design\Repository\Facade;

use App\Domain\Design\Entity\DesignDataIsolation;
use App\Domain\Design\Entity\DesignGenerationTaskEntity;
use App\Domain\Design\Entity\ValueObject\DesignGenerationAssetType;

interface DesignGenerationTaskRepositoryInterface
{
    public function create(DesignDataIsolation $dataIsolation, DesignGenerationTaskEntity $entity): void;

    public function update(DesignDataIsolation $dataIsolation, DesignGenerationTaskEntity $entity): void;

    public function delete(DesignDataIsolation $dataIsolation, DesignGenerationTaskEntity $entity): void;

    public function findByProjectAndGenerationId(
        DesignDataIsolation $dataIsolation,
        int $projectId,
        DesignGenerationAssetType $assetType,
        string $generationId
    ): ?DesignGenerationTaskEntity;

    /**
     * 按 id 倒序取未终态任务，用于首轮轮询恢复。
     *
     * 倒序而非正序：恢复只关心刚创建的任务（id 最大），倒序保证它们永远落在扫描窗口内，
     * 不会被大量历史运行中任务占满窗口后饿死。调用方用返回值中最小的 id 作为下一批游标。
     *
     * @return DesignGenerationTaskEntity[]
     */
    public function findProcessingTasksBeforeId(int $cursorId, int $limit): array;
}
