<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Unit\SuperMagic\SandboxRestart;

use App\Application\SuperMagic\Agent\Command\RestartAllMagicClawSandboxCommand;
use App\Application\SuperMagic\Task\Command\RestartAllSandboxCommand;
use App\Application\SuperMagic\Task\DTO\SandboxRestartOptions;
use App\Application\SuperMagic\Task\DTO\SandboxRestartOutcome;
use App\Application\SuperMagic\Task\DTO\SandboxRestartResult;
use App\Application\SuperMagic\Task\Service\SandboxRestartAppService;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxPodSnapshot;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartPlan;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartReason;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartScope;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRestartTarget;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxTopicBinding;
use Hyperf\Command\Command as HyperfCommand;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use ReflectionProperty;
use RuntimeException;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;

/**
 * CLI 契约：参数解析、dry-run、退出码、旧命令名兼容.
 *
 * 这些用例直接钉住"脚本能否被流水线安全调用"：
 * 参数写错要在动手前失败；有失败必须返回非零；旧命令名不能静默只处理一半范围。
 *
 * @internal
 */
class RestartAllSandboxCommandTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Hyperf 命令行基类在构造时读取协程 hook 常量；纯单元测试没有 Swoole/Swow。
        if (! defined('SWOOLE_HOOK_FLAGS')) {
            define('SWOOLE_HOOK_FLAGS', 0);
        }
    }

    public function testCommandIsRegisteredWithItsName(): void
    {
        $command = $this->command(new SandboxRestartCommandSpy());

        self::assertSame('sandbox:restart-all', $command->getName());

        // bin/hyperf.php 启动时会把命令 add() 进 Symfony Application，名字为空会直接 fatal。
        $application = new Application();
        $application->add($command);
        self::assertTrue($application->has('sandbox:restart-all'));
    }

    public function testDeprecatedMagicClawNameStillWorks(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $command = $this->magicClawCommand($spy);

        self::assertSame('magic-claw:restart-sandbox-all', $command->getName());

        $application = new Application();
        $application->add($command);
        self::assertTrue($application->has('magic-claw:restart-sandbox-all'));

        self::assertSame(0, (new CommandTester($command))->execute(['--dry-run' => true]));
        self::assertInstanceOf(SandboxRestartOptions::class, $spy->plannedWith);
        self::assertSame(SandboxRestartScope::MagicClaw, $spy->plannedWith->getScope(), '旧命令名永远只处理 Magic Claw');
        self::assertSame(['Running'], $spy->plannedWith->getStatuses(), '保留旧命令的默认状态过滤');
    }

    public function testDeprecatedMagicClawNameCannotBeWidenedBackToAll(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $command = $this->magicClawCommand($spy);

        self::assertSame(0, (new CommandTester($command))->execute(['--dry-run' => true, '--scope' => 'all']));

        self::assertSame(SandboxRestartScope::MagicClaw, $spy->plannedWith->getScope());
    }

    /**
     * 帮助文本现在是这套用法的唯一出处（不再有独立的 shell 脚本），
     * 因此把"跑之前必须知道的事"钉住：不发给 Agent 消息、每个话题的动作顺序、退出码。
     */
    public function testHelpExplainsSemanticsAndExitCodes(): void
    {
        // --help 是 Application 级选项，CommandTester 无法传；直接读命令自身的帮助文本。
        $command = $this->command(new SandboxRestartCommandSpy());
        $display = $command->getProcessedHelp();
        self::assertStringContainsString('never sends a chat message', $display);
        self::assertStringContainsString('waiting_for_user tasks are suspended first', $display);
        self::assertStringContainsString('prefers the warm pool', $display);
        self::assertStringContainsString('Exit codes:', $display);
        self::assertStringContainsString('php bin/hyperf.php sandbox:restart-all', $display, '帮助里要给出可直接执行的形式');
    }

    public function testDryRunPrintsPlanButNeverExecutes(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $spy->plan = $this->planWithTarget(101, 'sandbox-101');

        $tester = new CommandTester($this->command($spy));
        self::assertSame(0, $tester->execute(['--dry-run' => true]));

        $display = $tester->getDisplay();
        self::assertStringContainsString('[TARGET] 1/1', $display);
        self::assertStringContainsString('recreates=1', $display);
        self::assertStringContainsString('targets: 1', $display);
        self::assertFalse($spy->executed, 'dry-run 不能删除或重建任何沙箱');
    }

    public function testInvalidStatusFailsBeforePlanning(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $tester = new CommandTester($this->command($spy));

        self::assertSame(1, $tester->execute(['--status' => 'Bogus']));
        self::assertStringContainsString('Invalid --status value "Bogus"', $tester->getDisplay());
        self::assertNull($spy->plannedWith, '参数非法时不应该请求网关');
    }

    public function testInvalidScopeFailsBeforePlanning(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $tester = new CommandTester($this->command($spy));

        self::assertSame(1, $tester->execute(['--scope' => 'everything']));
        self::assertStringContainsString('Invalid --scope value "everything"', $tester->getDisplay());
        self::assertNull($spy->plannedWith);
    }

    public function testCodeOptionImpliesMagicClawScope(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $tester = new CommandTester($this->command($spy));

        self::assertSame(0, $tester->execute(['--dry-run' => true, '--code' => 'my-claw']));

        self::assertSame(SandboxRestartScope::MagicClaw, $spy->plannedWith->getScope());
        self::assertSame('my-claw', $spy->plannedWith->getClawCode());
    }

    public function testStatusAndConcurrencyAreForwardedAndNormalised(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $tester = new CommandTester($this->command($spy));

        self::assertSame(0, $tester->execute([
            '--dry-run' => true,
            '--status' => 'running,notready',
            '--concurrency' => '4',
            '--limit' => '7',
        ]));

        self::assertSame(['Running', 'NotReady'], $spy->plannedWith->getStatuses());
        self::assertSame(4, $spy->plannedWith->getConcurrency());
        self::assertSame(7, $spy->plannedWith->getLimit());
    }

    public function testPlanErrorReturnsFailureExitCode(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $spy->planError = 'Unable to read the latest sandbox images';
        $tester = new CommandTester($this->command($spy));

        self::assertSame(1, $tester->execute([]));
        self::assertStringContainsString('Failed to build the restart plan', $tester->getDisplay());
    }

    public function testEmptyPlanSkipsExecution(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $tester = new CommandTester($this->command($spy));

        self::assertSame(0, $tester->execute([]));
        self::assertFalse($spy->executed);
        self::assertStringContainsString('targets: 0', $tester->getDisplay());
    }

    public function testFailureOutcomeReturnsNonZeroExitCode(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $spy->plan = $this->planWithTarget(101, 'sandbox-101');
        $target = $spy->plan->getTargets()[0];
        $spy->outcome = new SandboxRestartOutcome(
            results: [SandboxRestartResult::failed($target, 'rebuild exploded', ['sandbox-101'], [], 1.2)],
            deletedPods: [],
            deletionFailures: [],
            suspendedTasks: 1,
            suspendedTopics: 1,
            durationSeconds: 1.2,
        );

        $tester = new CommandTester($this->command($spy));
        self::assertSame(1, $tester->execute([]));

        $display = $tester->getDisplay();
        self::assertStringContainsString('[FAIL] topic_id=101', $display);
        self::assertStringContainsString('failed: 1', $display);
        self::assertStringContainsString('suspended_tasks: 1', $display);
    }

    public function testSuccessfulOutcomeReportsNewSandboxId(): void
    {
        $spy = new SandboxRestartCommandSpy();
        $spy->plan = $this->planWithTarget(101, 'sandbox-101');
        $target = $spy->plan->getTargets()[0];
        $spy->outcome = new SandboxRestartOutcome(
            results: [SandboxRestartResult::restarted($target, 'sandbox-new', ['sandbox-101'], [], 2.0)],
            deletedPods: [],
            deletionFailures: [],
            suspendedTasks: 0,
            suspendedTopics: 1,
            durationSeconds: 2.0,
        );

        $tester = new CommandTester($this->command($spy));
        self::assertSame(0, $tester->execute([]));

        $display = $tester->getDisplay();
        self::assertStringContainsString('[OK] topic_id=101, new_sandbox_id=sandbox-new', $display);
        self::assertStringContainsString('restarted: 1', $display);
        self::assertSame(1, substr_count($display, '[OK]'), '每个目标只能打印一次，不能回调打印后又补打一遍');
        self::assertSame(1, $spy->progressCallbacks, '必须把进度回调传给用例，否则长任务没有实时输出');
    }

    private function planWithTarget(int $topicId, string $sandboxId): SandboxRestartPlan
    {
        $target = new SandboxRestartTarget(
            new SandboxTopicBinding($topicId, 11, 'user-1', 'org-1', $sandboxId),
            [SandboxPodSnapshot::fromGatewayArray([
                'sandbox_id' => $sandboxId,
                'status' => 'Running',
                'topic_id' => (string) $topicId,
                'bound' => true,
                'created_at' => '2026-09-01T00:00:00Z',
                'agent_image' => 'registry/agent:5.0.77',
                'agfs_image' => 'registry/agfs:1.0.14',
            ])],
            SandboxRestartReason::AgentImageOutdated,
        );

        return new SandboxRestartPlan(
            targets: [$target],
            deletions: [],
            skippedByReason: [],
            upToDateTopics: 0,
            listedPods: 1,
        );
    }

    private function command(SandboxRestartCommandSpy $spy): RestartAllSandboxCommand
    {
        $container = $this->createMock(ContainerInterface::class);
        $container->method('get')->willReturn(new SandboxRestartCommandServiceStub($spy));

        $command = new RestartAllSandboxCommand($container);
        // 测试进程没有 Swoole/Swow，命令默认会切到协程里执行；关掉它只验证命令逻辑。
        (new ReflectionProperty(HyperfCommand::class, 'coroutine'))->setValue($command, false);

        return $command;
    }

    private function magicClawCommand(SandboxRestartCommandSpy $spy): RestartAllMagicClawSandboxCommand
    {
        $container = $this->createMock(ContainerInterface::class);
        $container->method('get')->willReturn(new SandboxRestartCommandServiceStub($spy));

        $command = new RestartAllMagicClawSandboxCommand($container);
        (new ReflectionProperty(HyperfCommand::class, 'coroutine'))->setValue($command, false);

        return $command;
    }
}

/**
 * 命令与服务之间的可变记录.
 */
final class SandboxRestartCommandSpy
{
    public ?SandboxRestartOptions $plannedWith = null;

    public ?SandboxRestartPlan $plan = null;

    public ?SandboxRestartOutcome $outcome = null;

    public string $planError = '';

    public bool $executed = false;

    /** 是否把进度回调传给了用例（0/1），用于钉住"实时进度"这条契约 */
    public int $progressCallbacks = 0;
}

/**
 * 用固定计划/结果替身替换真实用例，命令测试因此不依赖网关、数据库与协程.
 */
readonly class SandboxRestartCommandServiceStub extends SandboxRestartAppService
{
    public function __construct(private SandboxRestartCommandSpy $spy)
    {
    }

    public function plan(SandboxRestartOptions $options): SandboxRestartPlan
    {
        $this->spy->plannedWith = $options;
        if ($this->spy->planError !== '') {
            throw new RuntimeException($this->spy->planError);
        }

        $plan = $this->spy->plan;
        if ($plan === null) {
            return new SandboxRestartPlan([], [], [], 0, 0);
        }

        $targets = $plan->getTargets();
        if ($options->getLimit() > 0) {
            $targets = array_slice($targets, 0, $options->getLimit());
        }

        return new SandboxRestartPlan(
            targets: $targets,
            deletions: $plan->getDeletions(),
            skippedByReason: $plan->getSkippedByReason(),
            upToDateTopics: $plan->getUpToDateTopics(),
            listedPods: $plan->getListedPods(),
        );
    }

    public function execute(
        SandboxRestartPlan $plan,
        SandboxRestartOptions $options,
        ?callable $onTargetDone = null
    ): SandboxRestartOutcome {
        $this->spy->executed = true;

        $outcome = $this->spy->outcome ?? new SandboxRestartOutcome([], [], [], 0, 0, 0.0);
        $this->spy->progressCallbacks = $onTargetDone === null ? 0 : 1;

        return $outcome;
    }
}
