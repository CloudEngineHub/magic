<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Application\Agent\Service;

use App\Domain\Mode\Entity\ModeDataIsolation;
use App\Domain\Mode\Entity\ModeEntity;
use App\Domain\Mode\Entity\ValueQuery\ModeQuery;
use App\Domain\Mode\Service\ModeDomainService;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\Operation;
use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType as ResourceVisibilityResourceType;
use App\Domain\Permission\Service\ResourceVisibilityDomainService;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Core\ValueObject\Page;
use Dtyq\SuperMagic\Application\Agent\Service\SuperMagicAgentAccessAppService;
use Dtyq\SuperMagic\Application\Collaboration\Policy\ResourceAccessPolicyService;
use Dtyq\SuperMagic\Domain\Agent\Entity\SuperMagicAgentEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\UserAgentEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentDomainService;
use Dtyq\SuperMagic\Domain\Agent\Service\UserAgentDomainService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionProperty;

/**
 * @internal
 */
class SuperMagicAgentAccessAppServiceTest extends TestCase
{
    private SuperMagicAgentAccessAppService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = (new ReflectionClass(SuperMagicAgentAccessAppService::class))->newInstanceWithoutConstructor();
        $this->setProperty($this->service, 'userAgentDomainService', $this->createUserAgentDomainService([]));
    }

    public function testListAccessibleAgentCodesReturnsVisibleSharedAgent(): void
    {
        $this->setProperty($this->service, 'superMagicAgentDomainService', $this->createAgentDomainService([
            $this->createAgentEntity('shared-agent'),
        ]));
        $this->setProperty($this->service, 'resourceVisibilityDomainService', $this->createResourceVisibilityDomainService([
            'shared-agent',
        ]));
        $this->setReadableAgentCodes(['shared-agent']);
        $this->setProperty($this->service, 'modeDomainService', $this->createModeDomainService([]));

        $result = $this->service->listAccessibleAgentCodes('DT001', 'user-1', ['shared-agent']);

        self::assertSame(['shared-agent'], $result['accessible_codes']);
        self::assertSame([], $result['missing_codes']);
    }

    public function testListAccessibleAgentCodesIncludesOfficialAgentCode(): void
    {
        $this->setProperty($this->service, 'superMagicAgentDomainService', $this->createAgentDomainService([]));
        $this->setProperty($this->service, 'resourceVisibilityDomainService', $this->createResourceVisibilityDomainService([]));
        $this->setReadableAgentCodes([]);
        $this->setProperty($this->service, 'modeDomainService', $this->createModeDomainService(['official-agent']));

        $result = $this->service->listAccessibleAgentCodes('DT001', 'user-1', ['official-agent', 'unknown-agent']);

        self::assertSame(['official-agent'], $result['accessible_codes']);
        self::assertSame(['unknown-agent'], $result['missing_codes']);
    }

    public function testListAccessibleAgentCodesIncludesHiredAgentWithoutLegacyVisibility(): void
    {
        $this->setProperty($this->service, 'superMagicAgentDomainService', $this->createAgentDomainService([
            $this->createAgentEntity('hired-agent'),
        ]));
        $this->setProperty($this->service, 'userAgentDomainService', $this->createUserAgentDomainService([
            'hired-agent',
        ]));
        $this->setProperty($this->service, 'resourceVisibilityDomainService', $this->createResourceVisibilityDomainService([]));
        $this->setReadableAgentCodes([]);
        $this->setProperty($this->service, 'modeDomainService', $this->createModeDomainService([]));

        $result = $this->service->listAccessibleAgentCodes('DT001', 'user-1', ['hired-agent']);

        self::assertSame(['hired-agent'], $result['accessible_codes']);
        self::assertSame([], $result['missing_codes']);
    }

    public function testListUsableAgentCodesOnlyReturnsInstalledAndOfficialAgents(): void
    {
        $this->setProperty($this->service, 'superMagicAgentDomainService', $this->createAgentDomainService([
            $this->createAgentEntity('installed-agent'),
            $this->createAgentEntity('visible-only-agent'),
        ]));
        $this->setProperty($this->service, 'userAgentDomainService', $this->createUserAgentDomainService([
            'installed-agent',
        ]));
        $this->setProperty($this->service, 'modeDomainService', $this->createModeDomainService(['official-agent']));

        $result = $this->service->listUsableAgentCodes(
            'DT001',
            'user-1',
            ['installed-agent', 'visible-only-agent', 'official-agent', 'unknown-agent']
        );

        self::assertSame(['installed-agent', 'official-agent'], $result['usable_codes']);
        self::assertSame(['unknown-agent'], $result['missing_codes']);
    }

    public function testAssertAgentUsableRejectsVisibleButUninstalledAgent(): void
    {
        $this->setProperty($this->service, 'superMagicAgentDomainService', $this->createAgentDomainService([
            $this->createAgentEntity('visible-only-agent'),
        ]));
        $this->setProperty($this->service, 'userAgentDomainService', $this->createUserAgentDomainService([]));
        $this->setProperty($this->service, 'modeDomainService', $this->createModeDomainService([]));

        $this->expectException(BusinessException::class);
        $this->service->assertAgentUsable(
            SuperMagicAgentDataIsolation::create('DT001', 'user-1'),
            'visible-only-agent'
        );
    }

    public function testCheckAgentAccessAllowsCreatorModeForEditor(): void
    {
        $resourceAccessPolicyService = $this->createMock(ResourceAccessPolicyService::class);
        $resourceAccessPolicyService->expects(self::once())
            ->method('getCurrentOperation')
            ->willReturn(Operation::Edit);
        $this->setProperty($this->service, 'resourceAccessPolicyService', $resourceAccessPolicyService);

        self::assertSame([true, ''], $this->service->checkAgentAccess(
            SuperMagicAgentDataIsolation::create('DT001', 'user-1'),
            'crew-creator',
            'collaborated-agent'
        ));
    }

    public function testCheckAgentAccessRejectsCreatorModeForReadOnlyCollaborator(): void
    {
        $resourceAccessPolicyService = $this->createMock(ResourceAccessPolicyService::class);
        $resourceAccessPolicyService->method('getCurrentOperation')->willReturn(Operation::Read);
        $this->setProperty($this->service, 'resourceAccessPolicyService', $resourceAccessPolicyService);

        self::assertSame([false, 'super_magic.agent.agent_not_available'], $this->service->checkAgentAccess(
            SuperMagicAgentDataIsolation::create('DT001', 'user-1'),
            'skill-creator',
            'collaborated-agent'
        ));
    }

    public function testCheckAgentAccessAllowsSmaModeForInstalledAgent(): void
    {
        $this->setProperty($this->service, 'userAgentDomainService', $this->createUserAgentDomainService([
            'SMA-installed-agent',
        ]));
        $this->setProperty($this->service, 'modeDomainService', $this->createModeDomainService([]));

        self::assertSame([true, ''], $this->service->checkAgentAccess(
            SuperMagicAgentDataIsolation::create('DT001', 'user-1'),
            'SMA-installed-agent',
            'ignored-agent-code'
        ));
    }

    public function testCheckAgentAccessRejectsSmaModeForUninstalledAgent(): void
    {
        $this->setProperty($this->service, 'userAgentDomainService', $this->createUserAgentDomainService([]));
        $this->setProperty($this->service, 'modeDomainService', $this->createModeDomainService([]));

        self::assertSame([false, 'super_magic.agent.agent_not_available'], $this->service->checkAgentAccess(
            SuperMagicAgentDataIsolation::create('DT001', 'user-1'),
            'SMA-uninstalled-agent',
            'ignored-agent-code'
        ));
    }

    public function testCheckAgentAccessAllowsOtherTopicPatterns(): void
    {
        self::assertSame([true, ''], $this->service->checkAgentAccess(
            SuperMagicAgentDataIsolation::create('DT001', 'user-1'),
            'general',
            'SMA-stale-agent-code'
        ));
    }

    /**
     * @param array<SuperMagicAgentEntity> $entities
     */
    private function createAgentDomainService(array $entities): SuperMagicAgentDomainService
    {
        return new readonly class($entities) extends SuperMagicAgentDomainService {
            public function __construct(private array $entities)
            {
            }

            public function findByCodes(SuperMagicAgentDataIsolation $dataIsolation, array $codes): array
            {
                return $this->entities;
            }

            public function getCodesByCreator(SuperMagicAgentDataIsolation $dataIsolation, string $creator): array
            {
                $codes = [];
                foreach ($this->entities as $entity) {
                    if ($entity->getCreator() === $creator) {
                        $codes[] = $entity->getCode();
                    }
                }

                return $codes;
            }
        };
    }

    /**
     * @param array<string> $codes
     */
    private function createResourceVisibilityDomainService(array $codes): ResourceVisibilityDomainService
    {
        return new readonly class($codes) extends ResourceVisibilityDomainService {
            public function __construct(private array $codes)
            {
            }

            public function getUserAccessibleResourceCodes(
                PermissionDataIsolation $dataIsolation,
                string $userId,
                ResourceVisibilityResourceType $resourceType,
                ?array $resourceIds = null
            ): array {
                return $this->codes;
            }
        };
    }

    /** @param array<string> $codes */
    private function setReadableAgentCodes(array $codes): void
    {
        $resourceAccessPolicyService = $this->createMock(ResourceAccessPolicyService::class);
        $resourceAccessPolicyService->method('getReadableResourceCodes')->willReturn([
            'operations' => [],
            'operation_codes' => [],
            'visibility_codes' => $codes,
            'all_codes' => $codes,
        ]);
        $this->setProperty($this->service, 'resourceAccessPolicyService', $resourceAccessPolicyService);
    }

    /**
     * @param array<string> $codes
     */
    private function createUserAgentDomainService(array $codes): UserAgentDomainService
    {
        return new class($codes) extends UserAgentDomainService {
            public function __construct(private array $codes)
            {
            }

            public function findUserAgentOwnershipsByCodes(SuperMagicAgentDataIsolation $dataIsolation, array $agentCodes): array
            {
                $result = [];
                foreach ($agentCodes as $agentCode) {
                    if (! in_array($agentCode, $this->codes, true)) {
                        continue;
                    }
                    $result[$agentCode] = (new UserAgentEntity())
                        ->setAgentCode($agentCode);
                }

                return $result;
            }

            public function findAgentCodesBySourceTypes(SuperMagicAgentDataIsolation $dataIsolation, array $sourceTypes): array
            {
                return $this->codes;
            }

            public function findUserAgentOwnershipByCode(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode): ?UserAgentEntity
            {
                if (! in_array($agentCode, $this->codes, true)) {
                    return null;
                }

                return (new UserAgentEntity())->setAgentCode($agentCode);
            }
        };
    }

    /**
     * @param array<string> $officialCodes
     */
    private function createModeDomainService(array $officialCodes): ModeDomainService
    {
        return new class($officialCodes) extends ModeDomainService {
            public function __construct(private array $officialCodes)
            {
            }

            public function getModes(ModeDataIsolation $dataIsolation, ModeQuery $query, Page $page): array
            {
                $modes = [];
                foreach ($this->officialCodes as $officialCode) {
                    $mode = new ModeEntity();
                    $mode->setIdentifier($officialCode);
                    $modes[] = $mode;
                }

                return ['total' => count($modes), 'list' => $modes];
            }
        };
    }

    private function createAgentEntity(string $code): SuperMagicAgentEntity
    {
        $entity = new SuperMagicAgentEntity();
        $entity->setCode($code);
        $entity->setCreator('');

        return $entity;
    }

    private function setProperty(object $object, string $property, mixed $value): void
    {
        $reflectionProperty = new ReflectionProperty($object, $property);
        $reflectionProperty->setAccessible(true);
        $reflectionProperty->setValue($object, $value);
    }
}
