<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\SuperMagic\Agent;

use App\Domain\ModelGateway\Entity\ValueObject\ModelGatewayDataIsolation;
use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Service\FunctionPermissionDomainService;
use App\Domain\SuperMagic\Agent\Entity\MagicClawEntity;
use App\Domain\SuperMagic\Agent\Exception\MagicClawRuntimeDeniedException;
use App\Domain\SuperMagic\Agent\Repository\Facade\MagicClawRepositoryInterface;
use App\Domain\SuperMagic\Agent\Service\MagicClawRuntimePolicyDomainService;
use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\Domain\SuperMagic\Project\Repository\Facade\ProjectRepositoryInterface;
use App\Domain\SuperMagic\Task\Entity\TaskEntity;
use App\Domain\SuperMagic\Task\Repository\Facade\TaskRepositoryInterface;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;
use App\Domain\SuperMagic\Topic\Repository\Facade\TopicRepositoryInterface;
use Closure;
use HyperfTest\Support\MagicClawTestEnvironment;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/** @internal */
final class MagicClawRuntimePolicyTest extends TestCase
{
    use MagicClawTestEnvironment;

    private MagicClawRuntimePolicyDomainService $policy;

    private MagicClawRepositoryInterface $claws;

    private ProjectEntity $project;

    private MagicClawEntity $claw;

    private bool $allowed = true;

    private bool $createAllowed = true;

    protected function setUp(): void
    {
        $this->prepareClawEnvironment();
        $this->project = new ProjectEntity(['id' => 10, 'project_mode' => 'magiclaw', 'user_organization_code' => 'org']);
        $this->claw = new MagicClawEntity(['id' => 5, 'project_id' => 10, 'organization_code' => 'org', 'user_id' => 'owner']);
        $resolvePermission = function ($isolation, string $owner, string $code, bool $fresh = false): bool {
            self::assertSame('org', $isolation->getCurrentOrganizationCode());
            self::assertSame('owner', $owner);
            if ($code === 'magic_claw.access') {
                self::assertTrue($fresh);
                return $this->allowed;
            }
            return $this->createAllowed;
        };
        $permissions = new readonly class($resolvePermission) extends FunctionPermissionDomainService {
            public function __construct(private Closure $resolver)
            {
            }

            public function checkPermission(PermissionDataIsolation $dataIsolation, string $userId, string $functionCode, bool $freshMembership = false): bool
            {
                return ($this->resolver)($dataIsolation, $userId, $functionCode, $freshMembership);
            }
        };
        $projects = $this->createMock(ProjectRepositoryInterface::class);
        $projects->method('findById')->with(10)->willReturnCallback(fn () => $this->project);
        $this->claws = $this->createMock(MagicClawRepositoryInterface::class);
        $this->claws->method('getByProjectId')->with(10)->willReturnCallback(fn () => $this->claw);
        $topics = $this->createMock(TopicRepositoryInterface::class);
        $topics->method('getTopicById')->willReturnCallback(static fn ($id) => $id === 20 ? new TopicEntity(['id' => 20, 'project_id' => 10, 'user_organization_code' => 'org']) : null);
        $tasks = $this->createMock(TaskRepositoryInterface::class);
        $tasks->method('getTaskById')->willReturnCallback(static fn ($id) => $id === 30 ? new TaskEntity(['id' => 30, 'topic_id' => 20]) : null);
        $this->policy = new MagicClawRuntimePolicyDomainService($permissions, $this->claws, $projects, $topics, $tasks);
    }

    public function testOwnerRevokedCannotRunEvenWhenNoPauseWasPersistedYet(): void
    {
        $this->allowed = false;
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->policy->assertTopic(20);
    }

    public function testOrdinaryProjectAndGenericModelCallAreUnaffected(): void
    {
        $this->allowed = false;
        $this->project->setProjectMode('general');
        self::assertNull($this->policy->assertTopic(20));
        $this->policy->assertModelInvocation(ModelGatewayDataIsolation::create('org', 'owner'), []);
    }

    public function testCreateRevocationDoesNotStopExistingClaw(): void
    {
        $this->createAllowed = false;
        self::assertSame($this->claw, $this->policy->assertTopic(20));
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->policy->assertCanCreate('org', 'owner');
    }

    public function testRegrantDoesNotClearPauseForAutomaticExecution(): void
    {
        $this->claw->setRuntimeBlockReason('permission_revoked');
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->policy->assertTopic(20);
    }

    public function testManualStartClearsOnlyObservedRevisionAfterSuccess(): void
    {
        $this->claw->setRuntimeBlockReason('permission_revoked');
        $this->claw->setRuntimeBlockRevision('123');
        $this->claws->expects(self::once())->method('clearRuntimeBlock')->with(5, '123')->willReturn(true);
        self::assertSame('started', $this->policy->manualStart(20, function () {
            self::assertSame($this->claw, $this->policy->assertTopic(20));
            return 'started';
        }));
        // Context bypass must not escape the manual operation.
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->policy->assertTopic(20);
    }

    public function testFailedManualStartKeepsPause(): void
    {
        $this->claw->setRuntimeBlockReason('permission_revoked');
        $this->claws->expects(self::never())->method('clearRuntimeBlock');
        $this->expectException(RuntimeException::class);
        $this->policy->manualStart(20, static fn () => throw new RuntimeException('network failed'));
    }

    public function testConcurrentRevocationCannotBeClearedByOldManualStart(): void
    {
        $this->claw->setRuntimeBlockReason('permission_revoked');
        $this->claw->setRuntimeBlockRevision('123');
        $this->claws->expects(self::once())->method('clearRuntimeBlock')->with(5, '123')->willReturn(false);
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->policy->manualStart(20, fn () => $this->claw->setRuntimeBlockRevision('124'));
    }

    public function testModelTaskResolvesItsCanonicalTopicAndRejectsRevokedOwner(): void
    {
        $this->allowed = false;
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->policy->assertModelInvocation(ModelGatewayDataIsolation::create('org', 'owner'), ['magic_task_id' => '30']);
    }

    public function testModelRejectsConflictingTopic(): void
    {
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->policy->assertModelInvocation(ModelGatewayDataIsolation::create('org', 'owner'), ['magic_task_id' => '30', 'magic_topic_id' => '21']);
    }

    public function testModelRejectsCrossOrganization(): void
    {
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->policy->assertModelInvocation(ModelGatewayDataIsolation::create('other-org', 'owner'), ['magic_topic_id' => '20']);
    }

    public function testModelRejectsMissingContextForExplicitAgentSource(): void
    {
        $this->expectException(MagicClawRuntimeDeniedException::class);
        $this->policy->assertModelInvocation(ModelGatewayDataIsolation::create('org', 'owner'), ['source_id' => 'super_magic']);
    }
}
