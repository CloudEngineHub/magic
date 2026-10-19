<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Agent;

use App\Application\SuperMagic\Task\Service\AgentAppService;
use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\SuperMagic\Agent\Exception\MagicClawRuntimeDeniedException;
use App\Domain\SuperMagic\Agent\Service\MagicClawRuntimePolicyDomainService;
use App\Domain\SuperMagic\Task\Service\SandboxVersionDomainService;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;
use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\SuperMagic\Task\Locker\SandboxLifecycleLock;
use Closure;
use HyperfTest\Support\MagicClawTestEnvironment;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use ReflectionClass;

/** @internal */
final class AgentAppServiceLifecycleTest extends TestCase
{
    use MagicClawTestEnvironment;

    private MagicClawRuntimePolicyDomainService $policy;

    private SandboxVersionDomainService $versions;

    private TopicEntity $topic;

    private AgentAppService $app;

    private DataIsolation $isolation;

    private bool $allowVersionCheck = false;

    private int $versionCalls = 0;

    protected function setUp(): void
    {
        $this->policy = $this->createMock(MagicClawRuntimePolicyDomainService::class);
        $lock = $this->createMock(SandboxLifecycleLock::class);
        $lock->method('run')->willReturnCallback(static fn ($id, $operation) => $operation());
        $this->prepareClawEnvironment([MagicClawRuntimePolicyDomainService::class => $this->policy, SandboxLifecycleLock::class => $lock]);
        $this->topic = new TopicEntity(['id' => 20, 'user_id' => 'owner', 'user_organization_code' => 'org', 'sandbox_id' => 'actual-id']);
        $topics = $this->createMock(TopicDomainService::class);
        $topics->method('getTopicById')->with(20)->willReturn($this->topic);
        $check = function (int $topicId, bool $useCache, string $sandboxId): array {
            self::assertTrue($this->allowVersionCheck);
            self::assertSame([20, false, 'actual-id'], [$topicId, $useCache, $sandboxId]);
            ++$this->versionCalls;
            return ['needs_update' => false];
        };
        $this->versions = new readonly class($check) extends SandboxVersionDomainService {
            public function __construct(private Closure $check)
            {
            }

            public function checkSandboxVersion(int $topicId, bool $useCache = true, string $effectiveSandboxId = ''): array
            {
                return ($this->check)($topicId, $useCache, $effectiveSandboxId);
            }
        };
        $reflection = new ReflectionClass(AgentAppService::class);
        $this->app = $reflection->newInstanceWithoutConstructor();
        foreach (['topicDomainService' => $topics, 'sandboxVersionDomainService' => $this->versions, 'logger' => new NullLogger()] as $name => $value) {
            $reflection->getProperty($name)->setValue($this->app, $value);
        }
        $this->isolation = new DataIsolation(['current_user_id' => 'owner', 'current_organization_code' => 'org']);
    }

    #[DataProvider('operations')]
    public function testEveryManualOperationChecksCurrentPermissionBeforeResourceCalls(string $method): void
    {
        $this->policy->expects(self::once())->method('manualStart')->with(20)->willThrowException(new MagicClawRuntimeDeniedException());
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->app->{$method}($this->isolation, 20);
    }

    #[DataProvider('operations')]
    public function testEveryManualOperationRejectsCrossOrganization(string $method): void
    {
        $this->isolation->setCurrentOrganizationCode('other-org');
        $this->policy->expects(self::never())->method('manualStart');
        $this->expectException(BusinessException::class);
        $this->app->{$method}($this->isolation, 20);
    }

    public static function operations(): array
    {
        return [['startSandbox'], ['restartSandbox'], ['upgradeSandbox']];
    }

    public function testUpToDateUpgradeDoesNotRestartAnAllowedUnpausedSandbox(): void
    {
        $this->policy->method('manualStart')->willReturnCallback(static fn ($id, $operation) => $operation());
        $this->allowVersionCheck = true;
        self::assertSame('actual-id', $this->app->upgradeSandbox($this->isolation, 20));
        self::assertSame(1, $this->versionCalls);
    }
}
