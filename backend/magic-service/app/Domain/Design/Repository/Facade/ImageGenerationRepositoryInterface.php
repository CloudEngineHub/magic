<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Design\Repository\Facade;

use App\Domain\Design\Entity\DesignDataIsolation;
use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\Design\Entity\ValueObject\ImageGenerationType;

/**
 * 图片生成任务仓储接口.
 */
interface ImageGenerationRepositoryInterface
{
    /**
     * 创建生图任务
     */
    public function create(DesignDataIsolation $dataIsolation, ImageGenerationEntity $entity): void;

    /**
     * 根据 ID 查询任务
     */
    public function findById(DesignDataIsolation $dataIsolation, int $id): ?ImageGenerationEntity;

    /**
     * 根据 project_id 和 image_id 查询任务
     */
    public function findByProjectAndImageId(DesignDataIsolation $dataIsolation, int $projectId, string $imageId): ?ImageGenerationEntity;

    /**
     * 更新任务状态
     */
    public function updateStatus(DesignDataIsolation $dataIsolation, int $id, string $status, ?string $errorMessage = null): void;

    /**
     * 原子地将 pending 任务标记为 processing，避免重复消费.
     */
    public function tryMarkAsProcessing(DesignDataIsolation $dataIsolation, int $id): bool;

    /**
     * 查询全局待执行任务，用于后台补偿扫描.
     *
     * @param array<int, ImageGenerationType|int> $types
     * @return array<int, ImageGenerationEntity>
     */
    public function findPendingByTypes(array $types, int $limit): array;

    public function completed(DesignDataIsolation $dataIsolation, int $id, string $fileName): void;
}
