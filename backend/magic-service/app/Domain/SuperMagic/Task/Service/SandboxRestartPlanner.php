<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Service;

use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxImageVersion;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxPodDeletion;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxPodSnapshot;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartPlan;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartReason;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartScope;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartTarget;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxTopicBinding;

/**
 * 把"网关 pod 清单 + 话题归属 + 最新镜像"算成一份可执行的重启计划.
 *
 * 纯计算，无 IO、无随机、无时间依赖：同样的输入永远得到同一份计划，
 * 因此可以 --dry-run 先看计划再执行，也可以直接用单测钉住每一条判定规则。
 *
 * 输入三份事实：
 *   - pods       网关清单（每行 = 一个真实 pod，含它创建时用的镜像）
 *   - bindings   话题归属（topic → project/owner/sandbox_id），只读业务表快照
 *   - latest     网关当前发布的最新镜像
 *
 * 输出三类动作：
 *   - targets    需要"删掉该话题名下全部 pod，再重建一个"
 *   - deletions  只删除不重建（未绑定温池、找不到话题的孤儿）
 *   - skipped    明确不处理的原因（便于运维回答"为什么没重启我这一只"）
 */
class SandboxRestartPlanner
{
    private const SKIP_NO_OWNER = 'topic owner is incomplete';

    private const SKIP_OUT_OF_SCOPE = 'project is outside the restart scope';

    private const SKIP_SHARED_WARM_POOL = 'unbound warm-pool pod is not part of this scope';

    private const SKIP_UNOWNED_SANDBOX = 'no topic owns this sandbox';

    /**
     * @param SandboxPodSnapshot[] $pods 网关清单
     * @param array<int, SandboxTopicBinding> $bindingsByTopicId topicId => 归属信息
     * @param array{agent_image?: string, agfs_image?: string} $latestImages 网关最新镜像
     * @param int[] $scopeProjectIds 仅 Magic Claw 范围使用：允许处理的项目 id
     */
    public function plan(
        array $pods,
        array $bindingsByTopicId,
        array $latestImages,
        bool $force,
        SandboxRestartScope $scope,
        array $scopeProjectIds = [],
    ): SandboxRestartPlan {
        $deletions = [];
        $skipped = [];
        /** @var array<int, array{binding: SandboxTopicBinding, pods: SandboxPodSnapshot[]}> $grouped */
        $grouped = [];
        $allowedProjects = array_fill_keys(array_map('intval', $scopeProjectIds), true);

        foreach ($pods as $pod) {
            // 未绑定的温池 pod 没有 owner，"重建"无从谈起：删掉后由温池补货流程
            // 用新镜像补齐。Magic Claw 范围不动共享池，避免影响其他用户。
            if ($pod->isUnboundWarmPool()) {
                if ($scope->deletesSharedPods()) {
                    $deletions[] = new SandboxPodDeletion($pod, 'unbound warm-pool sandbox');
                } else {
                    $skipped[self::SKIP_SHARED_WARM_POOL][] = $pod;
                }
                continue;
            }

            $binding = $this->resolveBinding($pod, $bindingsByTopicId);
            if ($binding === null) {
                if ($scope->deletesSharedPods()) {
                    $deletions[] = new SandboxPodDeletion($pod, self::SKIP_UNOWNED_SANDBOX);
                } else {
                    $skipped[self::SKIP_UNOWNED_SANDBOX][] = $pod;
                }
                continue;
            }

            if (! $binding->hasOwner()) {
                $skipped[self::SKIP_NO_OWNER][] = $pod;
                continue;
            }

            if ($scope === SandboxRestartScope::MagicClaw && ! isset($allowedProjects[$binding->getProjectId()])) {
                $skipped[self::SKIP_OUT_OF_SCOPE][] = $pod;
                continue;
            }

            $topicId = $binding->getTopicId();
            if (! isset($grouped[$topicId])) {
                $grouped[$topicId] = ['binding' => $binding, 'pods' => []];
            }
            $grouped[$topicId]['pods'][] = $pod;
        }

        $targets = [];
        $upToDateTopics = 0;
        foreach ($grouped as $group) {
            usort(
                $group['pods'],
                static fn (SandboxPodSnapshot $left, SandboxPodSnapshot $right): int => $left->getCreatedAtTimestamp() <=> $right->getCreatedAtTimestamp()
            );
            $reason = $this->decideReason($group['pods'], $latestImages, $force);
            if (! $reason->needsRestart()) {
                ++$upToDateTopics;
                continue;
            }
            $targets[] = new SandboxRestartTarget($group['binding'], $group['pods'], $reason);
        }

        return new SandboxRestartPlan(
            targets: $targets,
            deletions: $deletions,
            skippedByReason: $skipped,
            upToDateTopics: $upToDateTopics,
            listedPods: count($pods),
        );
    }

    /**
     * 判定一个话题是否需要重启.
     *
     * @param SandboxPodSnapshot[] $pods 该话题名下的全部 pod
     * @param array{agent_image?: string, agfs_image?: string} $latestImages
     */
    private function decideReason(array $pods, array $latestImages, bool $force): SandboxRestartReason
    {
        if ($force) {
            return SandboxRestartReason::Forced;
        }

        $latestAgentImage = SandboxImageVersion::agentImage($latestImages);
        $latestAgfsImage = SandboxImageVersion::agfsImage($latestImages);
        if ($latestAgentImage === '' || $latestAgfsImage === '') {
            // 没有发布标准就无法证明"已是最新"。这里返回 Unknown 而不是 UpToDate，
            // 由调用方决定是否继续（应用层在没有 --force 时会直接报错要求显式确认）。
            return SandboxRestartReason::ImagesUnknown;
        }

        $agentOutdated = false;
        $agfsOutdated = false;
        foreach ($pods as $pod) {
            if (SandboxImageVersion::agentImage($pod->getImages()) === '' || SandboxImageVersion::agfsImage($pod->getImages()) === '') {
                // 老 pod 可能只有 agent 容器、没有 agfs sidecar；镜像不完整一律按未知处理。
                return SandboxRestartReason::ImagesUnknown;
            }
            if ($pod->getAgentImage() !== $latestAgentImage) {
                $agentOutdated = true;
            }
            if ($pod->getAgfsImage() !== $latestAgfsImage) {
                $agfsOutdated = true;
            }
        }

        if ($agentOutdated) {
            return SandboxRestartReason::AgentImageOutdated;
        }
        if ($agfsOutdated) {
            return SandboxRestartReason::AgfsImageOutdated;
        }

        return SandboxRestartReason::UpToDate;
    }

    /**
     * 把 pod 映射回话题.
     *
     * 首选 pod 的 topic-id 标签（冷启动与温池挂载都会打）。标签缺失时退化为
     * "沙箱 ID 即话题 ID"的历史约定，并要求话题记录的 sandbox_id 与之吻合，
     * 避免温池雪花 ID 恰好是数字时撞上真实话题 ID。
     *
     * @param array<int, SandboxTopicBinding> $bindingsByTopicId
     */
    private function resolveBinding(SandboxPodSnapshot $pod, array $bindingsByTopicId): ?SandboxTopicBinding
    {
        $labelTopicId = (int) $pod->getTopicId();
        if ($labelTopicId > 0) {
            return $bindingsByTopicId[$labelTopicId] ?? null;
        }

        $sandboxId = $pod->getSandboxId();
        $sandboxIdInt = (int) $sandboxId;
        if ($sandboxIdInt <= 0 || (string) $sandboxIdInt !== $sandboxId) {
            return null;
        }

        $binding = $bindingsByTopicId[$sandboxIdInt] ?? null;
        if ($binding === null) {
            return null;
        }

        // 走沙箱 ID 兜底时，必须确认话题自己记的就是这个沙箱（或它从未绑定过）。
        $persistedSandboxId = $binding->getSandboxId();
        if ($persistedSandboxId !== '' && $persistedSandboxId !== $sandboxId) {
            return null;
        }

        return $binding;
    }
}
