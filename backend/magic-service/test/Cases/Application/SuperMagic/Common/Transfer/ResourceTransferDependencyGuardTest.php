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
use Hyperf\Config\Config;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use ReflectionProperty;
use RuntimeException;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

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

    private function skill(string $code): AgentSkillEntity
    {
        $entity = new AgentSkillEntity();
        $entity->setSkillCode($code);
        return $entity;
    }
}
