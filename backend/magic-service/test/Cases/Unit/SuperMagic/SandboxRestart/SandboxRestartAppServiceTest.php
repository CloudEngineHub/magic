<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Unit\SuperMagic\SandboxRestart;

use App\Application\SuperMagic\Task\Contract\SandboxRebuildPortInterface;
use App\Application\SuperMagic\Task\DTO\SandboxRestartOptions;
use App\Application\SuperMagic\Task\DTO\SandboxRestartResult;
use App\Application\SuperMagic\Task\Service\SandboxRestartAppService;
use App\Application\SuperMagic\Task\Service\SandboxRestartBatchRunner;
use App\Domain\SuperMagic\Agent\Entity\MagicClawEntity;
use App\Domain\SuperMagic\Agent\Service\MagicClawDomainService;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxPodDeletion;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxPodSnapshot;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartPlan;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartReason;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartScope;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartTarget;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxTopicBinding;
use App\Domain\SuperMagic\Task\Entity\ValueObject\TaskStatus;
use App\Domain\SuperMagic\Task\Service\SandboxRestartPlanner;
use App\Domain\SuperMagic\Task\Service\TaskDomainService;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;
use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Constant\ResponseCode;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Result\SandboxListResult;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\SandboxGatewayInterface;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use RuntimeException;

/**
 * 重启编排：计划 → 挂起在途任务 → 删旧 pod → 按最新镜像重建.
 *
 * 重点钉三件事：
 * 1. 没有最新镜像标准时不做盲目全量重启（除非 --force）；
 * 2. 挂起任务发生在删除 pod 之前，且 waiting_for_user 也要挂起；
 * 3. 删除失败不阻断重建，但必须出现在结果里，不能被"成功"吞掉。
 *
 * @internal
 */
class SandboxRestartAppServiceTest extends TestCase
{
    private const LATEST = [
        'agent_image' => 'registry/agent:5.0.92',
        'agfs_image' => 'registry/agfs:1.0.14',
    ];

    public function testPlanRejectsBlindRestartWhenLatestImagesUnavailable(): void
    {
        $gateway = $this->gateway(
            pods: [$this->podArray('sandbox-101', 101, 'registry/agent:5.0.77')],
            latestImages: ['agent_image' => '', 'agfs_image' => '']
        );

        $service = $this->service($gateway, [$this->topic(101, 11, 'sandbox-101')]);

        $this->expectExceptionMessage('Re-run with --force');
        $service->plan(new SandboxRestartOptions());
    }

    public function testForceAllowsPlanningWithoutLatestImages(): void
    {
        $gateway = $this->gateway(
            pods: [$this->podArray('sandbox-101', 101, 'registry/agent:5.0.77')],
            latestImages: ['agent_image' => '', 'agfs_image' => '']
        );

        $plan = $this->service($gateway, [$this->topic(101, 11, 'sandbox-101')])
            ->plan(new SandboxRestartOptions(force: true));

        self::assertSame([101], array_map(static fn ($t) => $t->getTopicId(), $plan->getTargets()));
    }

    public function testPlanAppliesLimitAfterOldestFirstOrdering(): void
    {
        $gateway = $this->gateway(
            pods: [
                $this->podArray('a', 101, 'old', '2026-10-10T00:00:00Z'),
                $this->podArray('b', 102, 'old', '2026-09-01T00:00:00Z'),
            ],
            latestImages: self::LATEST
        );
        $service = $this->service($gateway, [$this->topic(101, 11, 'a'), $this->topic(102, 12, 'b')]);

        $plan = $service->plan(new SandboxRestartOptions(limit: 1));

        self::assertSame([102], array_map(static fn ($t) => $t->getTopicId(), $plan->getTargets()));
        self::assertSame(2, $plan->getListedPods());
    }

    public function testMagicClawScopeResolvesAllowedProjectsFromClawRecords(): void
    {
        $gateway = $this->gateway(
            pods: [
                $this->podArray('a', 101, 'old'),
                $this->podArray('b', 201, 'old'),
            ],
            latestImages: self::LATEST
        );
        $spy = new SandboxRestartClawSpy();
        $claws = new SandboxRestartClawStub([
            11 => $this->claw('claw-1', 11),
            21 => $this->claw('claw-2', 21),
        ], $spy);

        $service = $this->service(
            $gateway,
            [$this->topic(101, 11, 'a'), $this->topic(201, 21, 'b')],
            claws: $claws
        );

        $plan = $service->plan(new SandboxRestartOptions(scope: SandboxRestartScope::MagicClaw, clawCode: 'claw-2'));

        self::assertSame([201], array_map(static fn ($t) => $t->getTopicId(), $plan->getTargets()));
        self::assertSame([11, 21], $spy->requestedProjectIds, '只查一次，且包含清单里所有项目');
    }

    public function testExecuteSuspendsActiveWorkBeforeDeletingPods(): void
    {
        $gateway = $this->gateway(
            pods: [$this->podArray('sandbox-101', 101, 'registry/agent:5.0.77')],
            latestImages: self::LATEST
        );
        $topicService = $this->createMock(TopicDomainService::class);
        $topicService->method('getTopicsByIds')->willReturn([$this->topic(101, 11, 'sandbox-101')]);
        $taskService = $this->createMock(TaskDomainService::class);

        $log = new SandboxRestartCallLog();
        $topicService->expects(self::once())->method('updateTopicStatusBySandboxIds')
            ->willReturnCallback(function (array $sandboxIds, TaskStatus $status, array $from) use ($log) {
                $log->calls[] = 'suspend_topics';
                self::assertSame(['sandbox-101'], $sandboxIds);
                self::assertSame(TaskStatus::Suspended, $status);
                self::assertContains(TaskStatus::WAITING_FOR_USER, $from, '等用户回答的任务也必须挂起');
                return true;
            });
        $taskService->method('updateTaskStatusByTopicIds')->willReturnCallback(function (array $topicIds, TaskStatus $status) use ($log) {
            $log->calls[] = 'suspend_tasks';
            self::assertSame([101], $topicIds);
            self::assertSame(TaskStatus::Suspended, $status);
            return 3;
        });

        $port = new SandboxRestartPortStub($log);
        $service = $this->service($gateway, [], $topicService, $taskService, null, $port);

        $plan = new SandboxRestartPlan(
            targets: [$this->target(101, 11, 'sandbox-101')],
            deletions: [],
            skippedByReason: [],
            upToDateTopics: 0,
            listedPods: 1,
        );

        $outcome = $service->execute($plan, new SandboxRestartOptions());

        self::assertSame(['suspend_topics', 'suspend_tasks', 'delete:sandbox-101', 'rebuild:101'], $log->calls);
        self::assertSame(3, $outcome->getSuspendedTasks());
        self::assertSame(1, $outcome->getSuspendedTopics());
        self::assertSame(1, $outcome->getRestartedCount());
        self::assertSame(0, $outcome->getFailedCount());
        self::assertSame('new-sandbox-101', $outcome->getResults()[0]->getNewSandboxId());
    }

    public function testDeleteFailureDoesNotBlockRebuildButIsReported(): void
    {
        $gateway = $this->gateway(pods: [], latestImages: self::LATEST);
        $port = new SandboxRestartPortStub(new SandboxRestartCallLog(), failDeletes: ['sandbox-101']);
        $service = $this->service($gateway, [], null, null, null, $port);

        $plan = new SandboxRestartPlan(
            targets: [$this->target(101, 11, 'sandbox-101')],
            deletions: [],
            skippedByReason: [],
            upToDateTopics: 0,
            listedPods: 1,
        );

        $outcome = $service->execute($plan, new SandboxRestartOptions());

        self::assertSame(1, $outcome->getRestartedCount(), '删不掉也要继续重建，否则永远卡在旧镜像');
        self::assertSame(['sandbox-101'], $outcome->getResults()[0]->getFailedSandboxIds());
        self::assertTrue($outcome->hasFailures(), '删除失败必须让命令返回非零退出码');
    }

    public function testFailedRebuildIsReportedSeparatelyFromSuccess(): void
    {
        $gateway = $this->gateway(pods: [], latestImages: self::LATEST);
        $port = new SandboxRestartPortStub(new SandboxRestartCallLog(), failRebuild: [101]);
        $service = $this->service($gateway, [], null, null, null, $port);

        $plan = new SandboxRestartPlan(
            targets: [$this->target(101, 11, 'sandbox-101'), $this->target(102, 12, 'sandbox-102')],
            deletions: [],
            skippedByReason: [],
            upToDateTopics: 0,
            listedPods: 2,
        );

        $outcome = $service->execute($plan, new SandboxRestartOptions());

        self::assertSame(1, $outcome->getRestartedCount());
        self::assertSame(1, $outcome->getFailedCount());
        self::assertTrue($outcome->hasFailures());
        $failed = array_values(array_filter($outcome->getResults(), static fn ($r) => ! $r->isRestarted()));
        self::assertSame(101, $failed[0]->getTopicId());
        self::assertStringContainsString('rebuild exploded', $failed[0]->getError());
    }

    public function testOrphanAndWarmPoolPodsAreDeletedWithoutRebuild(): void
    {
        $gateway = $this->gateway(pods: [], latestImages: self::LATEST);
        $log = new SandboxRestartCallLog();
        $port = new SandboxRestartPortStub($log);
        $service = $this->service($gateway, [], null, null, null, $port);

        $plan = new SandboxRestartPlan(
            targets: [],
            deletions: [
                new SandboxPodDeletion(
                    SandboxPodSnapshot::fromGatewayArray([
                        'sandbox_id' => 'warm-900',
                        'warm_pool' => true,
                        'bound' => false,
                    ]),
                    'unbound warm-pool sandbox'
                ),
            ],
            skippedByReason: [],
            upToDateTopics: 0,
            listedPods: 1,
        );

        $outcome = $service->execute($plan, new SandboxRestartOptions());

        self::assertSame(['delete:warm-900'], $log->calls);
        self::assertCount(1, $outcome->getDeletedPods());
        self::assertSame(0, $outcome->getRestartedCount());
        self::assertFalse($outcome->hasFailures());
    }

    public function testExecuteReportsEveryTargetThroughTheProgressCallback(): void
    {
        $gateway = $this->gateway(pods: [], latestImages: self::LATEST);
        $service = $this->service($gateway, []);

        $plan = new SandboxRestartPlan(
            targets: [$this->target(101, 11, 'sandbox-101'), $this->target(102, 12, 'sandbox-102')],
            deletions: [],
            skippedByReason: [],
            upToDateTopics: 0,
            listedPods: 2,
        );

        $reported = [];
        $outcome = $service->execute(
            $plan,
            new SandboxRestartOptions(),
            static function (SandboxRestartResult $result) use (&$reported): void {
                $reported[] = $result->getTopicId();
            }
        );

        self::assertSame([101, 102], $reported, '每个目标完成时都要回调一次，命令层才能实时打进度');
        self::assertCount(count($outcome->getResults()), $reported, '回调次数必须与结果条数一致，不多不少');
    }

    public function testProgressCallbackFailureDoesNotChangeTheOutcome(): void
    {
        $gateway = $this->gateway(pods: [], latestImages: self::LATEST);
        $service = $this->service($gateway, []);

        $plan = new SandboxRestartPlan(
            targets: [$this->target(101, 11, 'sandbox-101')],
            deletions: [],
            skippedByReason: [],
            upToDateTopics: 0,
            listedPods: 1,
        );

        $outcome = $service->execute(
            $plan,
            new SandboxRestartOptions(),
            static function (): void {
                throw new RuntimeException('progress printer exploded');
            }
        );

        self::assertSame(1, $outcome->getRestartedCount(), '进度打印失败不能把成功改成失败');
        self::assertFalse($outcome->hasFailures());
    }

    /**
     * @param TopicEntity[] $topics
     */
    private function service(
        SandboxGatewayInterface $gateway,
        array $topics = [],
        ?TopicDomainService $topicService = null,
        ?TaskDomainService $taskService = null,
        ?MagicClawDomainService $claws = null,
        ?SandboxRebuildPortInterface $port = null,
    ): SandboxRestartAppService {
        if ($topicService === null) {
            $topicService = $this->createMock(TopicDomainService::class);
            $topicService->method('getTopicsByIds')->willReturn($topics);
        }

        if ($taskService === null) {
            $taskService = $this->createMock(TaskDomainService::class);
        }

        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn(new NullLogger());

        return new SandboxRestartAppService(
            gateway: $gateway,
            topicDomainService: $topicService,
            taskDomainService: $taskService,
            magicClawDomainService: $claws ?? new SandboxRestartClawStub([], new SandboxRestartClawSpy()),
            planner: new SandboxRestartPlanner(),
            rebuildPort: $port ?? new SandboxRestartPortStub(new SandboxRestartCallLog()),
            batchRunner: new SandboxRestartBatchRunner(),
            loggerFactory: $loggerFactory,
        );
    }

    /**
     * @param array<int, array<string, mixed>> $pods
     * @param array<string, string> $latestImages
     */
    private function gateway(array $pods, array $latestImages): SandboxGatewayInterface
    {
        $gateway = $this->createMock(SandboxGatewayInterface::class);
        $gateway->method('listSandboxes')->willReturn(SandboxListResult::fromApiResponse([
            'code' => ResponseCode::SUCCESS,
            'message' => 'ok',
            'data' => ['total' => count($pods), 'sandboxes' => $pods],
        ]));
        $gateway->method('getLatestImages')->willReturn($latestImages);

        return $gateway;
    }

    /**
     * @return array<string, mixed>
     */
    private function podArray(string $sandboxId, int $topicId, string $agentImage, string $createdAt = '2026-09-01T00:00:00Z'): array
    {
        return [
            'sandbox_id' => $sandboxId,
            'status' => 'Running',
            'topic_id' => (string) $topicId,
            'bound' => true,
            'created_at' => $createdAt,
            'agent_image' => $agentImage,
            'agfs_image' => self::LATEST['agfs_image'],
        ];
    }

    private function topic(int $topicId, int $projectId, string $sandboxId): TopicEntity
    {
        return (new TopicEntity())
            ->setId($topicId)
            ->setProjectId($projectId)
            ->setSandboxId($sandboxId)
            ->setUserId('user-1')
            ->setUserOrganizationCode('org-1');
    }

    private function claw(string $code, int $projectId): MagicClawEntity
    {
        $claw = new MagicClawEntity();
        $claw->setCode($code);
        $claw->setProjectId($projectId);
        return $claw;
    }

    private function target(int $topicId, int $projectId, string $sandboxId): SandboxRestartTarget
    {
        return new SandboxRestartTarget(
            new SandboxTopicBinding(
                $topicId,
                $projectId,
                'user-1',
                'org-1',
                $sandboxId
            ),
            [SandboxPodSnapshot::fromGatewayArray([
                'sandbox_id' => $sandboxId,
                'status' => 'Running',
                'topic_id' => (string) $topicId,
                'bound' => true,
            ])],
            SandboxRestartReason::AgentImageOutdated,
        );
    }
}

/**
 * 记录调用顺序的假重建端口.
 */
final class SandboxRestartPortStub implements SandboxRebuildPortInterface
{
    /**
     * @param SandboxRestartCallLog $log 与测试共享的调用记录
     * @param string[] $failDeletes 删除时抛异常的 sandbox id
     * @param int[] $failRebuild 重建时抛异常的 topic id
     */
    public function __construct(
        private readonly SandboxRestartCallLog $log,
        private readonly array $failDeletes = [],
        private readonly array $failRebuild = [],
    ) {
    }

    public function deleteSandbox(string $sandboxId): void
    {
        $this->log->calls[] = 'delete:' . $sandboxId;
        if (in_array($sandboxId, $this->failDeletes, true)) {
            throw new RuntimeException('delete exploded');
        }
    }

    public function rebuild(int $topicId, string $userId, string $organizationCode): string
    {
        $this->log->calls[] = 'rebuild:' . $topicId;
        if (in_array($topicId, $this->failRebuild, true)) {
            throw new RuntimeException('rebuild exploded');
        }
        return 'new-sandbox-' . $topicId;
    }
}

/**
 * MagicClawDomainService 是 readonly 服务，PHPUnit 无法替身；
 * 这里用 readonly 子类覆盖唯一需要的方法（与生产行为一致：按 projectId 批量查询），
 * 调用记录放在可变的 spy 对象里。
 */
readonly class SandboxRestartClawStub extends MagicClawDomainService
{
    /**
     * @param array<int, MagicClawEntity> $clawsByProjectId
     */
    public function __construct(private array $clawsByProjectId, private SandboxRestartClawSpy $spy)
    {
    }

    public function getByProjectIds(array $projectIds): array
    {
        $this->spy->requestedProjectIds = $projectIds;
        return array_intersect_key($this->clawsByProjectId, array_flip($projectIds));
    }
}

/**
 * 共享的调用记录（可变）.
 */
final class SandboxRestartCallLog
{
    /** @var string[] */
    public array $calls = [];
}

/**
 * 记录 Magic Claw 查询的可变 spy.
 */
final class SandboxRestartClawSpy
{
    /** @var int[] */
    public array $requestedProjectIds = [];
}
