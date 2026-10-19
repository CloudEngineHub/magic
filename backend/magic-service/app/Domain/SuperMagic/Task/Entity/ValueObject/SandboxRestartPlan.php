<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Entity\ValueObject;

/**
 * 一次重启的执行计划：动手前就把"重建哪些、只删哪些、为什么跳过"全部算清。
 *
 * 计划是纯数据，不持有任何服务引用，因此可以先 --dry-run 打印、再原样执行，
 * 也可以单独做单测：同一个输入永远得到同一份计划。
 */
readonly class SandboxRestartPlan
{
    /**
     * @param SandboxRestartTarget[] $targets 需要重建的话题沙箱，最老的在前
     * @param SandboxPodDeletion[] $deletions 只删除不重建的 pod（温池/孤儿）
     * @param array<string, SandboxPodSnapshot[]> $skippedByReason 未处理的 pod 及原因
     * @param int $upToDateTopics 已是最新镜像、无需重启的话题数
     * @param int $listedPods 网关返回的 pod 总数（过滤前）
     */
    public function __construct(
        private array $targets,
        private array $deletions,
        private array $skippedByReason,
        private int $upToDateTopics,
        private int $listedPods,
    ) {
    }

    /**
     * @return SandboxRestartTarget[]
     */
    public function getTargets(): array
    {
        return $this->targets;
    }

    /**
     * @return SandboxPodDeletion[]
     */
    public function getDeletions(): array
    {
        return $this->deletions;
    }

    /**
     * @return array<string, SandboxPodSnapshot[]>
     */
    public function getSkippedByReason(): array
    {
        return $this->skippedByReason;
    }

    public function getUpToDateTopics(): int
    {
        return $this->upToDateTopics;
    }

    public function getListedPods(): int
    {
        return $this->listedPods;
    }

    public function getSkippedPodCount(): int
    {
        $count = 0;
        foreach ($this->skippedByReason as $pods) {
            $count += count($pods);
        }
        return $count;
    }

    public function getTargetCount(): int
    {
        return count($this->targets);
    }

    public function getDeletionCount(): int
    {
        return count($this->deletions);
    }

    /**
     * 同话题存在多个 pod 的话题数，用于提示"话题表与 pod 漂移".
     */
    public function getDuplicateTopicCount(): int
    {
        $count = 0;
        foreach ($this->targets as $target) {
            if ($target->hasDuplicatePods()) {
                ++$count;
            }
        }
        return $count;
    }

    public function isEmpty(): bool
    {
        return $this->targets === [] && $this->deletions === [];
    }

    /**
     * 按创建时间升序重排目标：跑得最久的先重启，配合 --limit 天然形成灰度放量。
     *
     * PHP 的 usort 在 PHP 8 下是稳定排序，时间未知的目标会保持网关给出的相对顺序。
     *
     * @return SandboxRestartTarget[]
     */
    public function getTargetsOldestFirst(): array
    {
        $targets = $this->targets;
        usort($targets, static fn (SandboxRestartTarget $left, SandboxRestartTarget $right): int => $left->getOldestCreatedAtTimestamp() <=> $right->getOldestCreatedAtTimestamp());
        return $targets;
    }
}
