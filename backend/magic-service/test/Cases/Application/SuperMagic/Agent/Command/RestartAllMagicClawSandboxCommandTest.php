<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Agent\Command;

use App\Application\SuperMagic\Agent\Command\RestartAllMagicClawSandboxCommand;
use App\Application\SuperMagic\Task\Service\AgentAppService;
use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\SuperMagic\Agent\Entity\MagicClawEntity;
use App\Domain\SuperMagic\Agent\Service\MagicClawDomainService;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;
use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Constant\ResponseCode;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Result\SandboxListResult;
use Hyperf\Command\Command as HyperfCommand;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use ReflectionProperty;
use RuntimeException;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;

/**
 * 重启目标来自沙箱网关的 pod 清单，而不是 magic_super_magic_claw 表。
 *
 * 这里用假的网关清单把边界钉住：非龙虾项目的沙箱、对不上话题的沙箱都不允许重启。
 *
 * @internal
 */
class RestartAllMagicClawSandboxCommandTest extends TestCase
{
    private RestartCommandSpy $spy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->spy = new RestartCommandSpy();
    }

    public function testOldestSandboxIsRestartedFirst(): void
    {
        // 网关按 sandbox_id 返回（warm-101 在前），但跑得最久的是 warm-102，必须先重启它。
        $tester = $this->tester(
            sandboxes: [
                $this->sandbox('warm-101', 'Running', topicId: 101, createdAt: '2026-10-10T12:00:00Z'),
                $this->sandbox('warm-102', 'Running', topicId: 102, createdAt: '2026-09-01T08:30:00Z'),
                $this->sandbox('warm-103', 'Running', topicId: 103, createdAt: '2026-10-01T08:30:00Z'),
            ],
            topics: [
                101 => $this->topic(101, 11, 'warm-101'),
                102 => $this->topic(102, 12, 'warm-102'),
                103 => $this->topic(103, 13, 'warm-103'),
            ],
            claws: [11 => $this->claw('claw-1', 11), 12 => $this->claw('claw-2', 12), 13 => $this->claw('claw-3', 13)],
        );

        self::assertSame(0, $tester->execute([]));

        self::assertSame([102, 103, 101], $this->spy->restartTopicIds, '跑得最久的沙箱必须先重启');
        self::assertStringContainsString('created_at=2026-09-01T08:30:00Z', $tester->getDisplay());
    }

    public function testLimitTakesTheOldestSandboxesFirst(): void
    {
        $tester = $this->tester(
            sandboxes: [
                $this->sandbox('warm-101', 'Running', topicId: 101, createdAt: '2026-10-10T12:00:00Z'),
                $this->sandbox('warm-102', 'Running', topicId: 102, createdAt: '2026-09-01T08:30:00Z'),
            ],
            topics: [101 => $this->topic(101, 11, 'warm-101'), 102 => $this->topic(102, 12, 'warm-102')],
            claws: [11 => $this->claw('claw-1', 11), 12 => $this->claw('claw-2', 12)],
        );

        self::assertSame(0, $tester->execute(['--limit' => 1]));

        self::assertSame([102], $this->spy->restartTopicIds);
    }

    public function testSandboxesWithoutCreatedAtKeepGatewayOrder(): void
    {
        // 老网关不返回 created_at：退化为网关顺序（sandbox_id 升序），不能当成 1970 抢跑。
        $tester = $this->tester(
            sandboxes: [
                $this->sandbox('warm-101', 'Running', topicId: 101),
                $this->sandbox('warm-102', 'Running', topicId: 102),
            ],
            topics: [101 => $this->topic(101, 11, 'warm-101'), 102 => $this->topic(102, 12, 'warm-102')],
            claws: [11 => $this->claw('claw-1', 11), 12 => $this->claw('claw-2', 12)],
        );

        self::assertSame(0, $tester->execute([]));

        self::assertSame([101, 102], $this->spy->restartTopicIds);
        self::assertStringContainsString('created_at=unknown', $tester->getDisplay());
    }

    public function testCommandKeepsItsRegisteredName(): void
    {
        $command = $this->command(sandboxes: [], topics: [], claws: []);

        self::assertSame('magic-claw:restart-sandbox-all', $command->getName());

        // bin/hyperf.php 启动时会把命令 add() 进 Symfony Application，名字为空会直接 fatal。
        $application = new Application();
        $application->add($command);
        self::assertTrue($application->has('magic-claw:restart-sandbox-all'));
    }

    public function testRestartsRunningSandboxOfMagicClawOnly(): void
    {
        $tester = $this->tester(
            sandboxes: [
                $this->sandbox('warm-101', 'Running', topicId: 101),
                $this->sandbox('warm-201', 'Running', topicId: 201),
            ],
            topics: [101 => $this->topic(101, 11, 'warm-101'), 201 => $this->topic(201, 21, 'warm-201')],
            claws: [11 => $this->claw('claw-1', 11)],
        );

        self::assertSame(0, $tester->execute([]));

        $display = $tester->getDisplay();
        self::assertStringContainsString('[TARGET] code=claw-1, sandbox_id=warm-101, status=Running', $display);
        self::assertStringContainsString('project is not a Magic Claw', $display);
        self::assertSame([101], $this->spy->restartTopicIds, '只允许重启属于 Magic Claw 的沙箱');
        self::assertStringContainsString('listed: 2', $display);
        self::assertStringContainsString('restarted: 1', $display);
        self::assertStringContainsString('skipped: 1', $display);
    }

    public function testStatusFilterIsForwardedToTheGateway(): void
    {
        $tester = $this->tester(
            sandboxes: [$this->sandbox('warm-101', 'NotReady', topicId: 101)],
            topics: [101 => $this->topic(101, 11, 'warm-101')],
            claws: [11 => $this->claw('claw-1', 11)],
        );

        self::assertSame(0, $tester->execute(['--status' => 'running,notready']));

        self::assertSame(['Running', 'NotReady'], $this->spy->listedStatuses);
        self::assertSame([101], $this->spy->restartTopicIds);
    }

    public function testAnyStatusAsksTheGatewayWithoutFilter(): void
    {
        $tester = $this->tester(
            sandboxes: [$this->sandbox('101', 'NotFound', topicId: 101)],
            topics: [101 => $this->topic(101, 11, '101')],
            claws: [11 => $this->claw('claw-1', 11)],
        );

        self::assertSame(0, $tester->execute(['--status' => 'any']));

        self::assertSame([], $this->spy->listedStatuses);
        self::assertSame([101], $this->spy->restartTopicIds);
        self::assertStringContainsString('status_filter: any (disabled)', $tester->getDisplay());
    }

    public function testSandboxWithoutMatchingTopicIsSkipped(): void
    {
        $tester = $this->tester(
            sandboxes: [$this->sandbox('warm-999', 'Running', topicId: 999)],
            topics: [],
            claws: [],
        );

        self::assertSame(0, $tester->execute([]));

        self::assertSame([], $this->spy->restartTopicIds);
        self::assertStringContainsString('no topic matches this sandbox', $tester->getDisplay());
    }

    public function testLegacySandboxIdFallbackRequiresTopicSandboxIdToMatch(): void
    {
        // 没有 topic-id 标签时用数字沙箱 ID 兜底；话题记录的 sandbox_id 不吻合就必须跳过，
        // 否则温池雪花 ID 可能撞上真实话题 ID。
        $tester = $this->tester(
            sandboxes: [
                $this->sandbox('102', 'Running', topicId: ''),
                $this->sandbox('103', 'Running', topicId: ''),
            ],
            topics: [
                102 => $this->topic(102, 12, '102'),
                103 => $this->topic(103, 13, 'warm-303'),
            ],
            claws: [12 => $this->claw('claw-legacy', 12), 13 => $this->claw('claw-mismatch', 13)],
        );

        self::assertSame(0, $tester->execute([]));

        self::assertSame([102], $this->spy->restartTopicIds);
        self::assertStringContainsString('no topic matches this sandbox', $tester->getDisplay());
    }

    public function testCodeOptionTargetsSingleClaw(): void
    {
        $tester = $this->tester(
            sandboxes: [
                $this->sandbox('warm-101', 'Running', topicId: 101),
                $this->sandbox('warm-102', 'Running', topicId: 102),
            ],
            topics: [101 => $this->topic(101, 11, 'warm-101'), 102 => $this->topic(102, 12, 'warm-102')],
            claws: [11 => $this->claw('claw-1', 11), 12 => $this->claw('claw-2', 12)],
        );

        self::assertSame(0, $tester->execute(['--code' => 'claw-2']));

        self::assertSame([102], $this->spy->restartTopicIds);
        self::assertStringContainsString('[TARGET] code=claw-2', $tester->getDisplay());
    }

    public function testCodeOptionReportsWhenNoRunningSandboxMatches(): void
    {
        $tester = $this->tester(
            sandboxes: [$this->sandbox('warm-101', 'Running', topicId: 101)],
            topics: [101 => $this->topic(101, 11, 'warm-101')],
            claws: [11 => $this->claw('claw-1', 11)],
        );

        self::assertSame(0, $tester->execute(['--code' => 'claw-other']));

        self::assertSame([], $this->spy->restartTopicIds);
        self::assertStringContainsString('[NOT_FOUND] No running Magic Claw sandbox for code: claw-other', $tester->getDisplay());
    }

    public function testDryRunListsTargetsWithoutRestarting(): void
    {
        $tester = $this->tester(
            sandboxes: [$this->sandbox('warm-101', 'Running', topicId: 101)],
            topics: [101 => $this->topic(101, 11, 'warm-101')],
            claws: [11 => $this->claw('claw-1', 11)],
        );

        self::assertSame(0, $tester->execute(['--dry-run' => true]));

        self::assertSame([], $this->spy->restartTopicIds);
        self::assertStringContainsString('matched: 1', $tester->getDisplay());
    }

    public function testLimitCapsRestarts(): void
    {
        $tester = $this->tester(
            sandboxes: [
                $this->sandbox('warm-101', 'Running', topicId: 101),
                $this->sandbox('warm-102', 'Running', topicId: 102),
            ],
            topics: [101 => $this->topic(101, 11, 'warm-101'), 102 => $this->topic(102, 12, 'warm-102')],
            claws: [11 => $this->claw('claw-1', 11), 12 => $this->claw('claw-2', 12)],
        );

        self::assertSame(0, $tester->execute(['--limit' => 1]));

        self::assertSame([101], $this->spy->restartTopicIds);
    }

    public function testRestartFailureIsCounted(): void
    {
        $tester = $this->tester(
            sandboxes: [$this->sandbox('warm-101', 'Running', topicId: 101)],
            topics: [101 => $this->topic(101, 11, 'warm-101')],
            claws: [11 => $this->claw('claw-1', 11)],
            restartFails: true,
        );

        self::assertSame(0, $tester->execute([]));

        $display = $tester->getDisplay();
        self::assertStringContainsString('[FAIL]', $display);
        self::assertStringContainsString('failed: 1', $display);
    }

    public function testInvalidStatusOptionFailsBeforeListing(): void
    {
        $tester = $this->tester(
            sandboxes: [$this->sandbox('warm-101', 'Running', topicId: 101)],
            topics: [101 => $this->topic(101, 11, 'warm-101')],
            claws: [11 => $this->claw('claw-1', 11)],
        );

        self::assertSame(1, $tester->execute(['--status' => 'Bogus']));

        self::assertStringContainsString('Invalid --status value "Bogus"', $tester->getDisplay());
        self::assertSame(null, $this->spy->listedStatuses, '参数非法时不应该请求网关');
    }

    private function claw(string $code, int $projectId): MagicClawEntity
    {
        $claw = new MagicClawEntity();
        $claw->setCode($code);
        $claw->setOrganizationCode('org-1');
        $claw->setUserId('user-1');
        $claw->setProjectId($projectId);
        return $claw;
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

    /**
     * @return array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}
     */
    private function sandbox(string $sandboxId, string $status, int|string $topicId, string $createdAt = ''): array
    {
        return [
            'sandbox_id' => $sandboxId,
            'status' => $status,
            'project_id' => '',
            'topic_id' => (string) $topicId,
            'warm_pool' => false,
            'bound' => true,
            'created_at' => $createdAt,
        ];
    }

    /**
     * @param array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}> $sandboxes
     * @param array<int, TopicEntity> $topics
     * @param array<int, MagicClawEntity> $claws
     */
    private function tester(
        array $sandboxes,
        array $topics,
        array $claws,
        bool $restartFails = false,
    ): CommandTester {
        return new CommandTester($this->command($sandboxes, $topics, $claws, $restartFails));
    }

    /**
     * @param array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}> $sandboxes
     * @param array<int, TopicEntity> $topics
     * @param array<int, MagicClawEntity> $claws
     */
    private function command(
        array $sandboxes,
        array $topics,
        array $claws,
        bool $restartFails = false,
    ): TestableRestartAllMagicClawSandboxCommand {
        $topicDomainService = $this->createMock(TopicDomainService::class);
        $topicDomainService->method('getTopicsByIds')->willReturn(array_values($topics));

        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn($this->createMock(LoggerInterface::class));

        $command = new TestableRestartAllMagicClawSandboxCommand(
            new RestartCommandClawDomainService($claws),
            $topicDomainService,
            new RestartCommandAgentAppService($this->spy, $sandboxes),
            $loggerFactory,
            $this->spy,
            $restartFails,
        );
        // 测试进程没有 Swoole，命令默认会切到协程里执行；这里关掉协程，只验证命令逻辑。
        (new ReflectionProperty(HyperfCommand::class, 'coroutine'))->setValue($command, false);

        return $command;
    }
}

final class RestartCommandSpy
{
    /** @var null|string[] 传给网关的状态过滤，null 表示没有请求网关 */
    public ?array $listedStatuses = null;

    /** @var int[] 被真正重启的 topic ID */
    public array $restartTopicIds = [];
}

/**
 * 命令内的 DataIsolation::create() 依赖 DI 容器，这里替换掉重启这一步，保证单测不依赖容器。
 */
class TestableRestartAllMagicClawSandboxCommand extends RestartAllMagicClawSandboxCommand
{
    public function __construct(
        MagicClawDomainService $magicClawDomainService,
        TopicDomainService $topicDomainService,
        AgentAppService $agentAppService,
        LoggerFactory $loggerFactory,
        private readonly RestartCommandSpy $spy,
        private readonly bool $restartFails = false,
    ) {
        parent::__construct($magicClawDomainService, $topicDomainService, $agentAppService, $loggerFactory);
    }

    protected function restartSandbox(TopicEntity $topic): string
    {
        $this->spy->restartTopicIds[] = $topic->getId();

        if ($this->restartFails) {
            throw new RuntimeException('sandbox gateway exploded');
        }

        return 'sandbox-new';
    }
}

readonly class RestartCommandClawDomainService extends MagicClawDomainService
{
    /**
     * @param array<int, MagicClawEntity> $clawsByProjectId
     */
    public function __construct(private array $clawsByProjectId)
    {
    }

    public function getByProjectIds(array $projectIds): array
    {
        return array_intersect_key($this->clawsByProjectId, array_flip($projectIds));
    }
}

readonly class RestartCommandAgentAppService extends AgentAppService
{
    /**
     * @param array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}> $sandboxes
     */
    public function __construct(
        private RestartCommandSpy $spy,
        private array $sandboxes,
    ) {
    }

    public function listSandboxes(array $statuses = []): SandboxListResult
    {
        $this->spy->listedStatuses = $statuses;

        return SandboxListResult::fromApiResponse([
            'code' => ResponseCode::SUCCESS,
            'message' => 'ok',
            'data' => ['total' => count($this->sandboxes), 'sandboxes' => $this->sandboxes],
        ]);
    }
}
