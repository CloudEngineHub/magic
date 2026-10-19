<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\SuperMagic\Task\Service;

use App\Application\Chat\Service\MagicUserInfoAppService;
use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\SuperMagic\Agent\Repository\Facade\MagicClawRepositoryInterface;
use App\Domain\SuperMagic\Agent\Repository\Facade\SuperMagicAgentRepositoryInterface;
use App\Domain\SuperMagic\Common\Entity\ValueObject\DynamicConfig\DynamicConfigManager;
use App\Domain\SuperMagic\Common\Entity\ValueObject\SuperMagicProductContext;
use App\Domain\SuperMagic\Message\Repository\Facade\TaskMessageRepositoryInterface;
use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\Domain\SuperMagic\Project\Repository\Facade\ProjectRepositoryInterface;
use App\Domain\SuperMagic\Task\Entity\TaskEntity;
use App\Domain\SuperMagic\Task\Entity\ValueObject\AgentContext;
use App\Domain\SuperMagic\Task\Entity\ValueObject\AgentInitContext;
use App\Domain\SuperMagic\Task\Entity\ValueObject\SandboxRootFileIds;
use App\Domain\SuperMagic\Task\Service\AgentDomainService;
use App\Domain\SuperMagic\Task\Service\CrossProjectMentionPathTranslator;
use App\Domain\SuperMagic\Task\Service\WarmPoolSandboxDomainService;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;
use App\Domain\SuperMagic\Topic\Repository\Facade\TopicRepositoryInterface;
use App\Domain\SuperMagic\Workspace\Repository\Facade\WorkspaceRepositoryInterface;
use App\Domain\Token\Repository\Facade\MagicTokenRepositoryInterface;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Constant\WorkspaceStatus;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Response\AgentResponse;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\SandboxAgentInterface;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Constant\ResponseCode;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Result\GatewayResult;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\SandboxGatewayInterface;
use App\Infrastructure\Util\Locker\LockerInterface;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Log\NullLogger;

/**
 * ensureSandboxInitialized 去重保护测试.
 *
 * 重复沙箱的两个来源：
 * 1. 拿锁前解析的 sandbox_id 在等锁期间被其他流程（升级/重启、预热池 mount）
 *    换绑，拿锁后必须重读，否则会把新绑定的沙箱再次替换，泄漏旧 pod；
 * 2. 换绑成功后旧沙箱没有被停止，带着同样的 topic-id 标签泄漏。
 * 显式传入 sandbox_id 的重连场景保持原语义，不重读。
 *
 * @internal
 */
class AgentDomainServiceEnsureSandboxInitializedTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $config = $this->createMock(ConfigInterface::class);
        $config->method('get')->willReturnCallback(
            static fn (string $key, mixed $default = null): mixed => str_starts_with($key, 'super-magic.warm_pool.') ? false : 'test'
        );

        $container = new EnsureSandboxFakeContainer();
        $container->services[ConfigInterface::class] = $config;
        ApplicationContext::setContainer($container);
    }

    /**
     * 拿锁期间绑定被并发换绑：拿锁后必须以 DB 里的最新 sandbox_id 为准，
     * 直接复用已就绪的新沙箱，而不是把新沙箱再次替换掉.
     */
    public function testReReadsFreshBindingAfterLockAndReusesReadySandbox(): void
    {
        $topicId = 945988521691942916;
        $staleId = '953340869490270209';
        $freshId = '945988521691942916';

        $topicRepository = $this->createMock(TopicRepositoryInterface::class);
        $topicRepository->expects($this->once())->method('getTopicById')->with($topicId)
            ->willReturn($this->buildTopic($topicId, $freshId));
        $topicRepository->expects($this->never())->method('updateTopicByCondition');

        $agent = $this->createMock(SandboxAgentInterface::class);
        // 拿锁前的旧 id 不应被探测；只允许用重读后的新 id 探测一次且已就绪。
        $agent->expects($this->once())->method('getWorkspaceStatus')->with(
            $this->anything(),
            $this->identicalTo($freshId)
        )->willReturn($this->readyResponse());
        $agent->expects($this->never())->method('initAgent');

        $gateway = $this->createMock(SandboxGatewayInterface::class);
        $gateway->expects($this->never())->method('createSandbox');
        $gateway->expects($this->never())->method('deleteSandbox');

        $service = $this->buildService($agent, $gateway, $topicRepository);

        $agentContext = $this->buildAgentContext($this->buildTopic($topicId, $staleId), '');

        $result = $service->ensureSandboxInitialized($this->buildDataIsolation(), $agentContext);

        $this->assertSame($freshId, $result);
    }

    /**
     * 换绑（冷创建）成功后必须停掉被替换的旧沙箱，避免旧 pod 泄漏成重复沙箱.
     */
    public function testColdCreateStopsReplacedSandbox(): void
    {
        $topicId = 934139051737997315;
        $staleId = '940990111199096833';
        $createdId = '934139051737997315';

        $topicRepository = $this->createMock(TopicRepositoryInterface::class);
        $topicRepository->method('getTopicById')->willReturn($this->buildTopic($topicId, $staleId));
        $topicRepository->expects($this->once())->method('updateTopicByCondition');

        $agent = $this->createMock(SandboxAgentInterface::class);
        $agent->expects($this->exactly(2))->method('getWorkspaceStatus')->willReturnOnConsecutiveCalls(
            $this->notFoundResponse(),
            $this->readyResponse()
        );
        $agent->expects($this->once())->method('initAgent')->willReturn($this->readyResponse());

        $gateway = $this->createMock(SandboxGatewayInterface::class);
        $gateway->expects($this->once())->method('createSandbox')->willReturn(
            new GatewayResult(ResponseCode::SUCCESS, 'ok', ['sandbox_id' => $createdId])
        );
        // 关键断言：被替换的旧沙箱被停止。
        $gateway->expects($this->once())->method('deleteSandbox')->with($staleId)
            ->willReturn(new GatewayResult(ResponseCode::SUCCESS, 'ok'));

        $service = $this->buildService($agent, $gateway, $topicRepository);

        $agentContext = $this->buildAgentContext($this->buildTopic($topicId, $staleId), '');

        $result = $service->ensureSandboxInitialized($this->buildDataIsolation(), $agentContext);

        $this->assertSame($createdId, $result);
    }

    /**
     * 调用方显式指定 sandbox_id（重连固定 pod）时保持原语义：不重读绑定.
     */
    public function testPinnedSandboxIdSkipsReread(): void
    {
        $topicId = 906155140512055299;
        $pinnedId = '954802104582074369';

        $topicRepository = $this->createMock(TopicRepositoryInterface::class);
        $topicRepository->expects($this->never())->method('getTopicById');

        $agent = $this->createMock(SandboxAgentInterface::class);
        $agent->expects($this->once())->method('getWorkspaceStatus')->with(
            $this->anything(),
            $this->identicalTo($pinnedId)
        )->willReturn($this->readyResponse());
        $agent->expects($this->never())->method('initAgent');

        $service = $this->buildService($agent, $this->createMock(SandboxGatewayInterface::class), $topicRepository);

        $agentContext = $this->buildAgentContext($this->buildTopic($topicId, '954802201063546881'), $pinnedId);

        $result = $service->ensureSandboxInitialized($this->buildDataIsolation(), $agentContext);

        $this->assertSame($pinnedId, $result);
    }

    /**
     * 旧沙箱停止失败（例如已被其他流程删除）不影响新沙箱初始化.
     */
    public function testColdCreateToleratesStopFailureOfReplacedSandbox(): void
    {
        $topicId = 944591153416183811;
        $staleId = '955787852072312833';
        $createdId = '944591153416183811';

        $topicRepository = $this->createMock(TopicRepositoryInterface::class);
        $topicRepository->method('getTopicById')->willReturn($this->buildTopic($topicId, $staleId));
        $topicRepository->expects($this->once())->method('updateTopicByCondition');

        $agent = $this->createMock(SandboxAgentInterface::class);
        $agent->expects($this->exactly(2))->method('getWorkspaceStatus')->willReturnOnConsecutiveCalls(
            $this->notFoundResponse(),
            $this->readyResponse()
        );
        $agent->expects($this->once())->method('initAgent')->willReturn($this->readyResponse());

        $gateway = $this->createMock(SandboxGatewayInterface::class);
        $gateway->expects($this->once())->method('createSandbox')->willReturn(
            new GatewayResult(ResponseCode::SUCCESS, 'ok', ['sandbox_id' => $createdId])
        );
        $gateway->expects($this->once())->method('deleteSandbox')->with($staleId)->willReturn(
            new GatewayResult(ResponseCode::ERROR, 'already deleted')
        );

        $service = $this->buildService($agent, $gateway, $topicRepository);

        $agentContext = $this->buildAgentContext($this->buildTopic($topicId, $staleId), '');

        $result = $service->ensureSandboxInitialized($this->buildDataIsolation(), $agentContext);

        $this->assertSame($createdId, $result);
    }

    /**
     * 镜像发布后的强制重建必须跳过温池：温池 pod 可能是发布前构建的，
     * 领用等于把刚删掉的老镜像原样换回来。
     *
     * 两个对照用例共用同一套夹具，唯一差异是 $allowWarmPool：
     * - true  → 温池被咨询（证明夹具确实能走到温池分支）；
     * - false → 温池完全不被咨询（证明跳过生效，而不是"本来就走不到"）。
     */
    public function testWarmPoolIsConsultedWhenCallerAllowsIt(): void
    {
        $warmPool = $this->createMock(WarmPoolSandboxDomainService::class);
        $warmPool->expects($this->once())->method('tryAcquireAndMount')->willReturn(null);

        $this->runRestartWithWarmPoolFlag($warmPool, true);
    }

    public function testWarmPoolIsSkippedWhenCallerForbidsIt(): void
    {
        $warmPool = $this->createMock(WarmPoolSandboxDomainService::class);
        $warmPool->expects($this->never())->method('tryAcquireAndMount');

        $this->runRestartWithWarmPoolFlag($warmPool, false);
    }

    /**
     * @param bool $allowWarmPool 透传给 ensureSandboxInitialized 的开关
     */
    private function runRestartWithWarmPoolFlag(WarmPoolSandboxDomainService $warmPool, bool $allowWarmPool): void
    {
        $topicId = 945988521691942917;
        $staleId = '953340869490270210';
        $createdId = '945988521691942918';

        // 打开温池开关，否则 tryWarmPoolFastPath 会在第一行就返回，无法证明跳过逻辑。
        $config = $this->createMock(ConfigInterface::class);
        $config->method('get')->willReturnCallback(
            static fn (string $key, mixed $default = null): mixed => $key === 'super-magic.warm_pool.enabled' ? true : ($default ?? 'test')
        );
        $container = ApplicationContext::getContainer();
        self::assertInstanceOf(EnsureSandboxFakeContainer::class, $container);
        $container->services[ConfigInterface::class] = $config;
        $container->services[WarmPoolSandboxDomainService::class] = $warmPool;

        $topicRepository = $this->createMock(TopicRepositoryInterface::class);
        $topicRepository->method('getTopicById')->willReturn($this->buildTopic($topicId, $staleId));
        $topicRepository->method('updateTopicByCondition')->willReturn(true);

        $agent = $this->createMock(SandboxAgentInterface::class);
        // 旧 pod 已不存在（NOT_FOUND），新沙箱就绪：分别应答，避免后续 waitForWorkspaceReady 抛错。
        $agent->method('getWorkspaceStatus')->willReturnCallback(
            fn (DataIsolation $isolation, string $sandboxId): AgentResponse => $sandboxId === $createdId
                ? $this->readyResponse()
                : $this->notFoundResponse()
        );
        $agent->expects($this->once())->method('initAgent')->willReturn(
            AgentResponse::fromApiResponse(['code' => ResponseCode::SUCCESS, 'message' => 'ok', 'data' => []])
        );

        $gateway = $this->createMock(SandboxGatewayInterface::class);
        $gateway->expects($this->once())->method('createSandbox')->willReturn(
            new GatewayResult(ResponseCode::SUCCESS, 'ok', ['sandbox_id' => $createdId])
        );

        $service = $this->buildService($agent, $gateway, $topicRepository);
        $agentContext = $this->buildAgentContext($this->buildTopic($topicId, $staleId), '');

        // 必须带 project 根目录：温池分支要求 project_space_root_file_id 非空，
        // 否则两个对照用例都会在进入温池前就返回，测试变得毫无意义。
        // 温池挂载要以用户身份写 metadata.json，缺少 token 时分支同样会提前返回。
        $dataIsolation = $this->buildDataIsolation();
        $dataIsolation->setUserAuthorizationToken('test-user-token');

        $result = $service->ensureSandboxInitialized(
            $dataIsolation,
            $agentContext,
            new SandboxRootFileIds('project-root-file-id', 'user-root-file-id', 'topic-root-file-id'),
            null,
            $allowWarmPool
        );

        self::assertSame($createdId, $result);
    }

    private function buildService(
        SandboxAgentInterface $agent,
        SandboxGatewayInterface $gateway,
        TopicRepositoryInterface $topicRepository
    ): AgentDomainService {
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn(new NullLogger());

        $locker = $this->createMock(LockerInterface::class);
        $locker->method('spinLock')->willReturn(true);
        $locker->method('release')->willReturn(true);

        return new AgentDomainService(
            $loggerFactory,
            $gateway,
            $agent,
            $this->createMock(MagicUserInfoAppService::class),
            $this->createMock(CloudFileRepositoryInterface::class),
            $this->createMock(DynamicConfigManager::class),
            $this->createMock(MagicClawRepositoryInterface::class),
            $this->createMock(SuperMagicAgentRepositoryInterface::class),
            $this->createMock(MagicTokenRepositoryInterface::class),
            $locker,
            $this->createMock(ProjectRepositoryInterface::class),
            $topicRepository,
            $this->createMock(WorkspaceRepositoryInterface::class),
            $this->createMock(TaskMessageRepositoryInterface::class),
            new CrossProjectMentionPathTranslator(),
        );
    }

    private function buildTopic(int $id, string $sandboxId): TopicEntity
    {
        return new TopicEntity([
            'id' => $id,
            'project_id' => 1,
            'topic_name' => 'test-topic',
            'sandbox_id' => $sandboxId,
            'agent_code' => '',
            'work_dir' => '',
        ]);
    }

    private function buildAgentContext(TopicEntity $topicEntity, string $contextSandboxId): AgentContext
    {
        $projectEntity = new ProjectEntity([
            'id' => 1,
            'project_name' => 'test-project',
        ]);

        $productContext = SuperMagicProductContext::fromEntities($projectEntity, $topicEntity, null, $contextSandboxId);

        return new AgentContext(
            $contextSandboxId,
            'test-auth-token',
            $projectEntity,
            $topicEntity,
            new TaskEntity(),
            AgentInitContext::createDefault($productContext)
        );
    }

    private function buildDataIsolation(): DataIsolation
    {
        $dataIsolation = new DataIsolation();
        $dataIsolation->setCurrentUserId('usi_test_user');

        return $dataIsolation;
    }

    private function readyResponse(): AgentResponse
    {
        return AgentResponse::fromApiResponse([
            'code' => ResponseCode::SUCCESS,
            'message' => 'ok',
            'data' => ['status' => WorkspaceStatus::READY],
        ]);
    }

    private function notFoundResponse(): AgentResponse
    {
        return AgentResponse::fromApiResponse([
            'code' => ResponseCode::NOT_FOUND,
            'message' => 'sandbox not found',
            'data' => [],
        ]);
    }
}

class EnsureSandboxFakeContainer implements ContainerInterface
{
    /** @var array<string, mixed> */
    public array $services = [];

    public function get(string $id): mixed
    {
        return $this->services[$id] ?? null;
    }

    public function has(string $id): bool
    {
        return isset($this->services[$id]);
    }
}
