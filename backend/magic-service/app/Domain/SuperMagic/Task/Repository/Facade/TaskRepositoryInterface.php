<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Repository\Facade;

use App\Domain\SuperMagic\Task\Entity\TaskEntity;
use App\Domain\SuperMagic\Task\Entity\ValueObject\TaskStatus;
use App\Domain\SuperMagic\Task\Repository\Model\TaskModel;

interface TaskRepositoryInterface
{
    /**
     * 获取任务模型实例.
     *
     * @return TaskModel 任务模型实例
     */
    public function getModel(): TaskModel;

    /**
     * 通过ID获取任务
     */
    public function getTaskById(int $id): ?TaskEntity;

    /** @param int[] $ids @return array<int, TaskEntity> */
    public function getTasksByIds(array $ids): array;

    /**
     * 通过任务ID(沙箱服务返回的taskId)获取任务
     */
    public function getTaskByTaskId(string $taskId): ?TaskEntity;

    /**
     * 通过话题ID获取任务列表.
     * @return array{list: TaskEntity[], total: int}
     */
    public function getTasksByTopicId(int $topicId, int $page, int $pageSize, array $conditions = []): array;

    /**
     * 创建任务
     */
    public function createTask(TaskEntity $taskEntity): TaskEntity;

    /**
     * 更新任务
     */
    public function updateTask(TaskEntity $taskEntity): bool;

    /**
     * 更新任务状态
     */
    public function updateTaskStatus(int $id, TaskStatus $status): bool;

    /**
     * 更新任务状态和错误信息.
     */
    public function updateTaskStatusAndErrMsg(int $id, TaskStatus $status, ?string $errMsg = null): bool;

    /**
     * 根据沙箱任务ID更新任务状态
     */
    public function updateTaskStatusByTaskId(int $id, TaskStatus $status): bool;

    /**
     * 根据沙箱任务ID更新任务状态和错误信息.
     */
    public function updateTaskStatusAndErrMsgByTaskId(int $id, TaskStatus $status, ?string $errMsg = null): bool;

    /**
     * 删除任务
     */
    public function deleteTask(int $id): bool;

    /**
     * 批量删除指定话题下的所有任务（软删除）.
     *
     * @param int $topicId 话题ID
     * @return int 被删除的任务数量
     */
    public function deleteTasksByTopicId(int $topicId): int;

    /**
     * 更新长时间处于运行状态的任务为错误状态
     *
     * @param string $timeThreshold 时间阈值，早于此时间的运行中任务将被标记为错误
     * @return int 更新的任务数量
     */
    public function updateStaleRunningTasks(string $timeThreshold): int;

    /**
     * 获取指定状态的任务列表.
     *
     * @param TaskStatus $status 任务状态
     * @return array<TaskEntity> 任务实体列表
     */
    public function getTasksByStatus(TaskStatus $status): array;

    /**
     * 获取最近更新时间超过指定时间的任务列表.
     *
     * @param string $timeThreshold 时间阈值，如果任务的更新时间早于此时间，则会被包含在结果中
     * @param int $limit 返回结果的最大数量
     * @return array<TaskEntity> 任务实体列表
     */
    public function getTasksExceedingUpdateTime(string $timeThreshold, int $limit = 100): array;

    /**
     * 获取创建时间超过指定时间且状态为运行中的任务列表.
     *
     * @param string $timeThreshold 时间阈值，如果任务的创建时间早于此时间，则会被包含在结果中
     * @param int $limit 返回结果的最大数量
     * @return array<TaskEntity> 任务实体列表
     */
    public function getRunningTasksExceedingCreatedTime(string $timeThreshold, int $limit = 100): array;

    /**
     * 获取指定话题下的任务数量.
     */
    public function getTaskCountByTopicId(int $topicId): int;

    /**
     * Update task status by topic IDs.
     *
     * @param array $topicIds Topic IDs to filter
     * @param string $status New status value
     * @param string $errMsg Error message
     * @param null|string $finishedTime Finished time
     * @param array $fromStatuses Only update tasks with these statuses (empty means no filter)
     */
    public function updateTaskStatusByTopicIds(array $topicIds, string $status, string $errMsg = '', ?string $finishedTime = null, array $fromStatuses = []): int;

    /**
     * 按条件批量更新任务.
     * 条件值为数组时走 whereIn，标量走 where。
     * 禁止传入 project_id / user_id 作为查询条件（这两个维度无索引），项目/用户维度请先经 topics 表转换为 topic_id 后再更新。
     */
    public function updateTaskByCondition(array $condition, array $data): bool;

    /**
     * 根据话题ID和任务ID列表获取任务实体列表.
     *
     * @param int $topicId 话题ID
     * @param array $taskIds 任务ID列表
     * @return TaskEntity[] 任务实体数组
     */
    public function getTasksByTopicIdAndTaskIds(int $topicId, array $taskIds): array;

    /**
     * 批量创建任务
     *
     * @param TaskEntity[] $taskEntities 任务实体数组
     * @return TaskEntity[] 创建成功的任务实体数组（包含生成的ID）
     */
    public function batchCreateTasks(array $taskEntities): array;
}
