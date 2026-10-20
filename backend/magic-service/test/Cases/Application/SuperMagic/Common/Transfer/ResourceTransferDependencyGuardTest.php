<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Common\Transfer;

use App\Application\KnowledgeBase\Service\KnowledgeBaseAppService;
use App\Application\SuperMagic\Common\Collaboration\Policy\ResourceAccessPolicyService;
use App\Application\SuperMagic\Common\Transfer\ResourceTransferDependencyGuard;
use App\Domain\Contact\Entity\MagicUserEntity;
use App\Domain\SuperMagic\Agent\Entity\AgentSkillEntity;
use App\Domain\SuperMagic\Agent\Service\SuperMagicAgentSkillDomainService;
use App\Domain\SuperMagic\Skill\Service\SkillMarketDomainService;
use App\Infrastructure\Core\DataIsolation\BaseOrganizationInfoManager;
use App\Infrastructure\Core\DataIsolation\BaseSubscriptionManager;
use App\Infrastructure\Core\DataIsolation\BaseThirdPlatformDataIsolationManager;
use App\Infrastructure\Core\DataIsolation\OrganizationInfoManagerInterface;
use App\Infrastructure\Core\DataIsolation\SubscriptionManagerInterface;
use App\Infrastructure\Core\DataIsolation\ThirdPlatformDataIsolationManagerInterface;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\Config\Config;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use ReflectionProperty;
use RuntimeException;

/** @internal */
final class ResourceTransferDependencyGuardTest extends TestCase
{
    private ?ContainerInterface $previousContainer = null;

    protected function setUp(): void
    {
        $this->previousContainer = ApplicationContext::hasContainer() ? ApplicationContext::getContainer() : null;
        ApplicationContext::setContainer(new class(new Config(['app_env' => 'testing'])) implements ContainerInterface {
            public function __construct(private readonly Config $config)
            {
            }

            public function get(string $id): mixed
            {
                return match ($id) {
                    ConfigInterface::class => $this->config,
                    ThirdPlatformDataIsolationManagerInterface::class => new BaseThirdPlatformDataIsolationManager(),
                    SubscriptionManagerInterface::class => new BaseSubscriptionManager(),
                    OrganizationInfoManagerInterface::class => new BaseOrganizationInfoManager(),
                    default => throw new RuntimeException('Unexpected dependency: ' . $id),
                };
            }

            public function make(string $id, array $parameters = []): mixed
            {
                return $this->get($id);
            }

            public function has(string $id): bool
            {
                return true;
            }
        });
    }

    protected function tearDown(): void
    {
        if ($this->previousContainer !== null) {
            ApplicationContext::setContainer($this->previousContainer);
        } else {
            (new ReflectionProperty(ApplicationContext::class, 'container'))->setValue(null, null);
        }
    }

    public function testBuiltinAndPublishedMarketSkillsSkipReceiverReadCheck(): void
    {
        $policy = $this->createMock(ResourceAccessPolicyService::class);
        // Only the receiver-unreadable private skill must be checked.
        $policy->expects(self::once())->method('assertReadable')
            ->with(self::anything(), self::anything(), self::anything(), 'SKILL-private');
        $skills = $this->createMock(SuperMagicAgentSkillDomainService::class);
        $skills->method('getByAgentCodeForCurrentVersion')->willReturn([
            $this->skill('develop-data-analysis-dashboard'),
            $this->skill('SKILL-market'),
            $this->skill('SKILL-private'),
        ]);
        $market = $this->createMock(SkillMarketDomainService::class);
        $market->method('getOfficialBuiltinSkillCodes')->willReturn(['develop-data-analysis-dashboard']);
        $market->method('getPublishedSkillCodes')->willReturn(['SKILL-market']);
        $knowledge = $this->createMock(KnowledgeBaseAppService::class);
        $knowledge->method('queriesRaw')->willReturn(['list' => []]);

        $sender = new MagicUserAuthorization();
        $sender->setOrganizationCode('org');
        $sender->setId('sender');
        $receiver = new MagicUserEntity();
        $receiver->setUserId('receiver');
        $receiver->setMagicId('magic');
        $receiver->setUserType(1);
        $receiver->setOrganizationCode('org');

        (new ResourceTransferDependencyGuard($policy, $skills, $market, $knowledge))
            ->assertAgentDependencies($sender, $receiver, 'SMA-1');
    }

    public function testFullPageContinuesUntilAnExplicitEmptyPage(): void
    {
        $knowledge = $this->createMock(KnowledgeBaseAppService::class);
        $pages = [];
        $knowledge->expects(self::exactly(2))->method('queriesRaw')->willReturnCallback(
            function ($authorization, array $query) use (&$pages): array {
                $pages[] = $query['page'];
                self::assertSame(['SMA-1'], $query['agent_codes']);
                return ['list' => $query['page'] === 1 ? $this->knowledgePage(1) : []];
            }
        );
        $knowledge->expects(self::exactly(100))->method('showRaw');
        $this->assertKnowledgeDependencies($knowledge);
        self::assertSame([1, 2], $pages);
    }

    public function testRepeatedFullPageFailsWithoutCheckingTheSameDependenciesAgain(): void
    {
        $knowledge = $this->createMock(KnowledgeBaseAppService::class);
        $knowledge->expects(self::exactly(2))->method('queriesRaw')->willReturn(['list' => $this->knowledgePage(1)]);
        $knowledge->expects(self::exactly(100))->method('showRaw');
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('pagination did not advance');
        $this->assertKnowledgeDependencies($knowledge);
    }

    public function testShortPageChecksEveryReceiverPermissionAndCompletes(): void
    {
        $knowledge = $this->createMock(KnowledgeBaseAppService::class);
        $knowledge->expects(self::once())->method('queriesRaw')->willReturn(['list' => [['code' => 'KB-one'], ['code' => 'KB-two']]]);
        $codes = [];
        $knowledge->expects(self::exactly(2))->method('showRaw')->willReturnCallback(
            static function ($authorization, string $code) use (&$codes): array {
                self::assertSame('receiver', $authorization->getId());
                $codes[] = $code;
                return [];
            }
        );
        $this->assertKnowledgeDependencies($knowledge);
        self::assertSame(['KB-one', 'KB-two'], $codes);
    }

    public function testPaginationCycleFailsEvenWhenConsecutivePagesDiffer(): void
    {
        $knowledge = $this->createMock(KnowledgeBaseAppService::class);
        $knowledge->expects(self::exactly(3))->method('queriesRaw')->willReturnOnConsecutiveCalls(
            ['list' => $this->knowledgePage(1)],
            ['list' => $this->knowledgePage(2)],
            ['list' => $this->knowledgePage(1)],
        );
        $knowledge->expects(self::exactly(200))->method('showRaw');
        $this->expectException(RuntimeException::class);
        $this->assertKnowledgeDependencies($knowledge);
    }

    public function testUniqueFullPagesStillStopAtTheRequestBudget(): void
    {
        $knowledge = $this->createMock(KnowledgeBaseAppService::class);
        $knowledge->expects(self::exactly(10))->method('queriesRaw')->willReturnCallback(
            fn ($authorization, array $query): array => ['list' => $this->knowledgePage($query['page'])]
        );
        $knowledge->expects(self::exactly(1000))->method('showRaw');
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('exceeded its page limit');
        $this->assertKnowledgeDependencies($knowledge);
    }

    public function testMissingPageListMustNotAuthorizeTheTransfer(): void
    {
        $knowledge = $this->createMock(KnowledgeBaseAppService::class);
        $knowledge->method('queriesRaw')->willReturn([]);
        $knowledge->expects(self::never())->method('showRaw');
        $this->expectException(RuntimeException::class);
        $this->assertKnowledgeDependencies($knowledge);
    }

    public function testReceiverReadFailureIsNotSwallowed(): void
    {
        $knowledge = $this->createMock(KnowledgeBaseAppService::class);
        $knowledge->method('queriesRaw')->willReturn(['list' => [['code' => 'KB-private']]]);
        $knowledge->method('showRaw')->willThrowException(new RuntimeException('receiver cannot read'));
        $this->expectExceptionMessage('receiver cannot read');
        $this->assertKnowledgeDependencies($knowledge);
    }

    public function testMalformedDependencyMustNotAuthorizeTheTransfer(): void
    {
        $knowledge = $this->createMock(KnowledgeBaseAppService::class);
        $knowledge->method('queriesRaw')->willReturn(['list' => [['name' => 'Missing resource code']]]);
        $knowledge->expects(self::never())->method('showRaw');
        $this->expectException(RuntimeException::class);
        $this->assertKnowledgeDependencies($knowledge);
    }

    private function skill(string $code): AgentSkillEntity
    {
        $entity = new AgentSkillEntity();
        $entity->setSkillCode($code);
        return $entity;
    }

    private function knowledgePage(int $page): array
    {
        return array_map(static fn ($index) => ['code' => 'KB-' . $page . '-' . $index], range(1, 100));
    }

    private function assertKnowledgeDependencies(KnowledgeBaseAppService $knowledge): void
    {
        $skills = $this->createMock(SuperMagicAgentSkillDomainService::class);
        $skills->method('getByAgentCodeForCurrentVersion')->willReturn([]);
        $market = $this->createMock(SkillMarketDomainService::class);
        $market->method('getOfficialBuiltinSkillCodes')->willReturn([]);
        $market->method('getPublishedSkillCodes')->willReturn([]);
        $sender = new MagicUserAuthorization();
        $sender->setOrganizationCode('org');
        $sender->setId('sender');
        $receiver = new MagicUserEntity();
        $receiver->setUserId('receiver');
        $receiver->setMagicId('magic');
        $receiver->setUserType(1);
        $receiver->setOrganizationCode('org');
        (new ResourceTransferDependencyGuard($this->createMock(ResourceAccessPolicyService::class), $skills, $market, $knowledge))
            ->assertAgentDependencies($sender, $receiver, 'SMA-1');
    }
}
