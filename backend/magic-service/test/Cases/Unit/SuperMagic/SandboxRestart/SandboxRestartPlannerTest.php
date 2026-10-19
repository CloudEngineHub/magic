<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Unit\SuperMagic\SandboxRestart;

use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxPodSnapshot;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartPlan;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartReason;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartScope;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxTopicBinding;
use App\Domain\SuperMagic\Task\Service\SandboxRestartPlanner;
use PHPUnit\Framework\TestCase;

/**
 * 重启计划生成的判定规则.
 *
 * 每一个用例都对应线上一种真实形态：镜像已最新、只有 agfs 变了、老网关没有镜像字段、
 * 同一话题漂移出两个 pod、温池 pod、找不到话题的孤儿、缺少 owner 的历史数据。
 *
 * @internal
 */
class SandboxRestartPlannerTest extends TestCase
{
    private const LATEST = [
        'agent_image' => 'registry/agent:5.0.92',
        'agfs_image' => 'registry/agfs:1.0.14',
    ];

    private SandboxRestartPlanner $planner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->planner = new SandboxRestartPlanner();
    }

    public function testUpToDateSandboxIsNotRestarted(): void
    {
        $plan = $this->plan(
            pods: [$this->pod('sandbox-101', 101, self::LATEST['agent_image'], self::LATEST['agfs_image'])],
            bindings: [$this->binding(101, 11, 'sandbox-101')],
        );

        self::assertSame([], $plan->getTargets());
        self::assertSame(1, $plan->getUpToDateTopics());
        self::assertTrue($plan->isEmpty());
    }

    public function testAgentImageDriftRequiresRestart(): void
    {
        $plan = $this->plan(
            pods: [$this->pod('sandbox-101', 101, 'registry/agent:5.0.77', self::LATEST['agfs_image'])],
            bindings: [$this->binding(101, 11, 'sandbox-101')],
        );

        self::assertCount(1, $plan->getTargets());
        self::assertSame(SandboxRestartReason::AgentImageOutdated, $plan->getTargets()[0]->getReason());
        self::assertSame([101], array_map(static fn ($t) => $t->getTopicId(), $plan->getTargets()));
    }

    public function testAgfsImageDriftRequiresRestart(): void
    {
        $plan = $this->plan(
            pods: [$this->pod('sandbox-101', 101, self::LATEST['agent_image'], 'registry/agfs:1.0.13')],
            bindings: [$this->binding(101, 11, 'sandbox-101')],
        );

        self::assertSame(SandboxRestartReason::AgfsImageOutdated, $plan->getTargets()[0]->getReason());
    }

    public function testPodWithoutImageInformationRequiresRestart(): void
    {
        // 老网关不返回镜像字段：无法证明已最新，发布场景必须重建。
        $plan = $this->plan(
            pods: [$this->pod('sandbox-101', 101, '', '')],
            bindings: [$this->binding(101, 11, 'sandbox-101')],
        );

        self::assertSame(SandboxRestartReason::ImagesUnknown, $plan->getTargets()[0]->getReason());
    }

    public function testForceRestartsEvenWhenImagesAreCurrent(): void
    {
        $plan = $this->plan(
            pods: [$this->pod('sandbox-101', 101, self::LATEST['agent_image'], self::LATEST['agfs_image'])],
            bindings: [$this->binding(101, 11, 'sandbox-101')],
            force: true,
        );

        self::assertSame(SandboxRestartReason::Forced, $plan->getTargets()[0]->getReason());
        self::assertSame(0, $plan->getUpToDateTopics());
    }

    public function testDuplicatePodsOfOneTopicAreAllDeletedAndTopicRebuiltOnce(): void
    {
        // 现网症状：话题表 sandbox_id 与实际 pod 漂移，同一话题并存旧 pod 和新 pod。
        $plan = $this->plan(
            pods: [
                $this->pod('9675582091886593', 101, 'registry/agent:5.0.77', self::LATEST['agfs_image'], '2026-10-10T14:30:00Z'),
                $this->pod('941300468243693569', 101, 'registry/agent:5.0.77', self::LATEST['agfs_image'], '2026-07-30T03:52:00Z'),
            ],
            bindings: [$this->binding(101, 11, '9675582091886593')],
        );

        self::assertCount(1, $plan->getTargets(), '同一话题只重建一次');
        $target = $plan->getTargets()[0];
        self::assertSame(
            ['941300468243693569', '9675582091886593'],
            $target->getSandboxIds(),
            '两个 pod 都要删，且最老的排在前面'
        );
        self::assertTrue($target->hasDuplicatePods());
        self::assertSame(1, $plan->getDuplicateTopicCount());
    }

    public function testMixedOldAndCurrentPodsStillRequireRestart(): void
    {
        // 新 pod 已是最新，但老 pod 还在跑旧镜像：必须整组处理，否则老 pod 永远留着。
        $plan = $this->plan(
            pods: [
                $this->pod('new', 101, self::LATEST['agent_image'], self::LATEST['agfs_image'], '2026-10-10T00:00:00Z'),
                $this->pod('old', 101, 'registry/agent:5.0.77', self::LATEST['agfs_image'], '2026-08-01T00:00:00Z'),
            ],
            bindings: [$this->binding(101, 11, 'new')],
        );

        self::assertCount(1, $plan->getTargets());
        self::assertSame(SandboxRestartReason::AgentImageOutdated, $plan->getTargets()[0]->getReason());
    }

    public function testUnboundWarmPoolPodIsDeletedButNotRebuilt(): void
    {
        $warm = SandboxPodSnapshot::fromGatewayArray([
            'sandbox_id' => 'warm-900',
            'status' => 'Running',
            'warm_pool' => true,
            'bound' => false,
            'agent_image' => 'registry/agent:5.0.77',
            'agfs_image' => self::LATEST['agfs_image'],
        ]);

        $plan = $this->plan(pods: [$warm], bindings: []);

        self::assertSame([], $plan->getTargets());
        self::assertCount(1, $plan->getDeletions());
        self::assertSame('warm-900', $plan->getDeletions()[0]->getPod()->getSandboxId());
        self::assertSame('unbound warm-pool sandbox', $plan->getDeletions()[0]->getReason());
    }

    public function testOrphanPodIsDeletedButNotRebuilt(): void
    {
        $plan = $this->plan(
            pods: [$this->pod('sandbox-999', 999, 'registry/agent:5.0.77', self::LATEST['agfs_image'])],
            bindings: [],
        );

        self::assertSame([], $plan->getTargets());
        self::assertCount(1, $plan->getDeletions());
        self::assertSame('no topic owns this sandbox', $plan->getDeletions()[0]->getReason());
    }

    public function testTopicWithoutOwnerIsSkippedNotRebuilt(): void
    {
        // 历史数据可能缺 user/org，重建需要 owner 身份发 STS，硬来只会中途中止。
        $plan = $this->plan(
            pods: [$this->pod('sandbox-101', 101, 'registry/agent:5.0.77', self::LATEST['agfs_image'])],
            bindings: [$this->binding(101, 11, 'sandbox-101', userId: '', orgCode: '')],
        );

        self::assertSame([], $plan->getTargets());
        self::assertSame([], $plan->getDeletions());
        self::assertSame(1, $plan->getSkippedPodCount());
        self::assertArrayHasKey('topic owner is incomplete', $plan->getSkippedByReason());
    }

    public function testMagicClawScopeIgnoresRegularProjectsAndSharedPods(): void
    {
        $warm = SandboxPodSnapshot::fromGatewayArray([
            'sandbox_id' => 'warm-900',
            'warm_pool' => true,
            'bound' => false,
        ]);
        $plan = $this->plan(
            pods: [
                $this->pod('sandbox-101', 101, 'registry/agent:5.0.77', self::LATEST['agfs_image']), // claw 项目
                $this->pod('sandbox-201', 201, 'registry/agent:5.0.77', self::LATEST['agfs_image']), // 普通项目
                $warm,
            ],
            bindings: [$this->binding(101, 11, 'sandbox-101'), $this->binding(201, 21, 'sandbox-201')],
            scope: SandboxRestartScope::MagicClaw,
            scopeProjectIds: [11],
        );

        self::assertSame([101], array_map(static fn ($t) => $t->getTopicId(), $plan->getTargets()));
        self::assertSame([], $plan->getDeletions(), 'Claw 范围不能删共享温池 pod');
        self::assertSame(2, $plan->getSkippedPodCount(), '普通项目与温池 pod 都记为跳过');
        self::assertArrayHasKey(
            'unbound warm-pool pod is not part of this scope',
            $plan->getSkippedByReason(),
            '温池 pod 的跳过原因必须与"项目不在范围内"区分开'
        );
    }

    public function testLegacyNumericSandboxIdRequiresMatchingTopicBinding(): void
    {
        // 无 topic-id 标签时用数字 sandbox_id 兜底，但话题记录的 sandbox_id 必须吻合，
        // 否则温池雪花 ID 可能撞上真实话题 ID。
        $plan = $this->plan(
            pods: [
                SandboxPodSnapshot::fromGatewayArray([
                    'sandbox_id' => '102',
                    'status' => 'Running',
                    'agent_image' => 'registry/agent:5.0.77',
                    'agfs_image' => self::LATEST['agfs_image'],
                ]),
                SandboxPodSnapshot::fromGatewayArray([
                    'sandbox_id' => '103',
                    'status' => 'Running',
                    'agent_image' => 'registry/agent:5.0.77',
                    'agfs_image' => self::LATEST['agfs_image'],
                ]),
            ],
            bindings: [
                $this->binding(102, 12, '102'),
                $this->binding(103, 13, 'warm-303'),
            ],
        );

        self::assertSame([102], array_map(static fn ($t) => $t->getTopicId(), $plan->getTargets()));
        self::assertCount(1, $plan->getDeletions(), '对不上的数字 id 按孤儿清理，不能误重启别的话题');
    }

    public function testTargetsAreOrderedOldestFirst(): void
    {
        $plan = $this->plan(
            pods: [
                $this->pod('a', 101, 'old', self::LATEST['agfs_image'], '2026-10-10T00:00:00Z'),
                $this->pod('b', 102, 'old', self::LATEST['agfs_image'], '2026-09-01T00:00:00Z'),
                $this->pod('c', 103, 'old', self::LATEST['agfs_image'], ''),
            ],
            bindings: [
                $this->binding(101, 11, 'a'),
                $this->binding(102, 12, 'b'),
                $this->binding(103, 13, 'c'),
            ],
        );

        self::assertSame([102, 101, 103], array_map(
            static fn ($t) => $t->getTopicId(),
            $plan->getTargetsOldestFirst()
        ), '跑得最久的先重启；时间未知的排最后');
    }

    /**
     * @param SandboxPodSnapshot[] $pods
     * @param SandboxTopicBinding[] $bindings
     */
    private function plan(
        array $pods,
        array $bindings,
        bool $force = false,
        SandboxRestartScope $scope = SandboxRestartScope::All,
        array $scopeProjectIds = [],
    ): SandboxRestartPlan {
        $bindingsById = [];
        foreach ($bindings as $binding) {
            $bindingsById[$binding->getTopicId()] = $binding;
        }

        return $this->planner->plan(
            pods: $pods,
            bindingsByTopicId: $bindingsById,
            latestImages: self::LATEST,
            force: $force,
            scope: $scope,
            scopeProjectIds: $scopeProjectIds,
        );
    }

    private function pod(
        string $sandboxId,
        int $topicId,
        string $agentImage,
        string $agfsImage,
        string $createdAt = '2026-09-01T00:00:00Z',
    ): SandboxPodSnapshot {
        return SandboxPodSnapshot::fromGatewayArray([
            'sandbox_id' => $sandboxId,
            'status' => 'Running',
            'topic_id' => (string) $topicId,
            'bound' => true,
            'created_at' => $createdAt,
            'agent_image' => $agentImage,
            'agfs_image' => $agfsImage,
        ]);
    }

    private function binding(
        int $topicId,
        int $projectId,
        string $sandboxId,
        string $userId = 'user-1',
        string $orgCode = 'org-1',
    ): SandboxTopicBinding {
        return new SandboxTopicBinding($topicId, $projectId, $userId, $orgCode, $sandboxId);
    }
}
