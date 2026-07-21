<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Domain\Agent\Service;

use App\Domain\Contact\Repository\Facade\MagicDepartmentUserRepositoryInterface;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\Operation;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\ResourceType as OperationPermissionResourceType;
use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType as ResourceVisibilityResourceType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityType;
use App\Domain\Permission\Service\OperationPermissionDomainService;
use App\Domain\Permission\Service\ResourceVisibilityDomainService;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentMarketEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentVersionEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\UserAgentEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentMarketType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\PublishStatus;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\PublishTargetType;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentMarketRepositoryInterface;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentPlaybookRepositoryInterface;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentMarketDomainService;
use Dtyq\SuperMagic\Domain\Agent\Service\UserAgentDomainService;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class SuperMagicAgentMarketDomainServiceTest extends TestCase
{
    public function testItMergesShelfCollaborativeAndPublisherOrganizationMarketIds(): void
    {
        $marketRepository = $this->createMock(AgentMarketRepositoryInterface::class);
        $marketRepository->expects(self::once())
            ->method('findPublishedOrganizationIdsByAgentCodes')
            ->with('ORG', ['agent-collaborative'])
            ->willReturn([20, 30]);
        $marketRepository->expects(self::once())
            ->method('findPublishedOrganizationIdsByPublisher')
            ->with('ORG', 'user-1')
            ->willReturn([40]);

        $visibilityService = $this->createVisibilityService(['10', '20']);
        $operationService = $this->createOperationService([
            'user-1' => ['agent-collaborative' => Operation::Read],
        ]);

        $service = $this->createService($marketRepository, $visibilityService, $operationService);

        self::assertSame(
            [10, 20, 30, 40],
            $service->getDiscoverableOrganizationMarketIds(PermissionDataIsolation::create('ORG', 'user-1'), 'user-1')
        );
    }

    public function testItAllowsCollaboratorToDiscoverOrganizationMarketOutsideShelf(): void
    {
        $service = $this->createService();
        $market = new AgentMarketEntity();
        $market->setId(99)->setAgentCode('agent-collaborative');
        $market->setOrganizationCode('ORG');
        $market->setPublisherId('another-user');
        $market->setMarketType(AgentMarketType::ORGANIZATION);
        $market->setPublishStatus(PublishStatus::PUBLISHED);

        self::assertTrue($service->isMarketDiscoverable(
            $market,
            'ORG',
            'collaborator-user',
            false,
            true,
        ));
    }

    public function testItAllowsPublisherToDiscoverOrganizationMarketWithoutOwnerPermission(): void
    {
        $service = $this->createService();
        $market = new AgentMarketEntity();
        $market->setId(100)->setAgentCode('agent-publisher');
        $market->setOrganizationCode('ORG');
        $market->setPublisherId('publisher-user');
        $market->setMarketType(AgentMarketType::ORGANIZATION);
        $market->setPublishStatus(PublishStatus::PUBLISHED);

        self::assertTrue($service->isMarketDiscoverable(
            $market,
            'ORG',
            'publisher-user',
            false,
            false,
        ));
    }

    public function testItReportsCreatorAsDiscoverabilitySource(): void
    {
        $service = $this->createService();
        $market = new AgentMarketEntity();
        $market->setId(101)->setAgentCode('agent-publisher');
        $market->setOrganizationCode('ORG');
        $market->setPublisherId('publisher-user');
        $market->setMarketType(AgentMarketType::ORGANIZATION);
        $market->setPublishStatus(PublishStatus::PUBLISHED);

        self::assertSame(
            ['creator'],
            $service->getMarketDiscoverabilitySourcesForUser(
                PermissionDataIsolation::create('ORG', 'publisher-user'),
                $market,
                'publisher-user'
            )
        );
    }

    public function testItPreviewsOrganizationTargetAsShelfWithoutPersistedMarket(): void
    {
        $version = (new AgentVersionEntity())
            ->setOrganizationCode('ORG')
            ->setCode('agent-organization')
            ->setCreator('publisher-user')
            ->setPublishTargetType(PublishTargetType::ORGANIZATION);

        self::assertSame(
            ['shelf'],
            $this->createService()->getVersionMarketDiscoverabilitySourcesForUser(
                PermissionDataIsolation::create('ORG', 'publisher-user'),
                $version,
                'organization-member'
            )
        );
    }

    public function testItPreviewsExplicitMemberTargetAsShelfWithoutPersistedMarket(): void
    {
        $version = (new AgentVersionEntity())
            ->setOrganizationCode('ORG')
            ->setCode('agent-member')
            ->setCreator('publisher-user')
            ->setPublishTargetType(PublishTargetType::MEMBER)
            ->setPublishTargetValue(['user_ids' => ['shared-user'], 'department_ids' => []]);

        self::assertSame(
            ['shelf'],
            $this->createService()->getVersionMarketDiscoverabilitySourcesForUser(
                PermissionDataIsolation::create('ORG', 'publisher-user'),
                $version,
                'shared-user'
            )
        );
    }

    public function testItPreviewsParentDepartmentTargetAsShelfWithoutPersistedMarket(): void
    {
        $version = (new AgentVersionEntity())
            ->setOrganizationCode('ORG')
            ->setCode('agent-department')
            ->setCreator('publisher-user')
            ->setPublishTargetType(PublishTargetType::MEMBER)
            ->setPublishTargetValue(['user_ids' => [], 'department_ids' => ['department-parent']]);
        $departmentUserRepository = $this->createMock(MagicDepartmentUserRepositoryInterface::class);
        $departmentUserRepository->expects(self::once())
            ->method('getDepartmentIdsByUserIds')
            ->willReturn(['department-user' => ['department-child', 'department-parent']]);

        self::assertSame(
            ['shelf'],
            $this->createService(departmentUserRepository: $departmentUserRepository)
                ->getVersionMarketDiscoverabilitySourcesForUser(
                    PermissionDataIsolation::create('ORG', 'publisher-user'),
                    $version,
                    'department-user'
                )
        );
    }

    public function testItRevokesOnlyHiresThatLostAllDiscoverabilitySources(): void
    {
        $market = new AgentMarketEntity();
        $market->setId(102)->setAgentCode('agent-shared');
        $market->setOrganizationCode('ORG');
        $market->setPublisherId('publisher-user');
        $market->setMarketType(AgentMarketType::ORGANIZATION);
        $market->setPublishStatus(PublishStatus::PUBLISHED);

        $marketRepository = $this->createMock(AgentMarketRepositoryInterface::class);
        $marketRepository->expects(self::once())
            ->method('findPublishedOrganizationByAgentCodeForUpdate')
            ->with('ORG', 'agent-shared')
            ->willReturn($market);
        $userAgentService = $this->createMock(UserAgentDomainService::class);
        $userAgentService->expects(self::once())
            ->method('findUserAgentOwnershipsByMarketSource')
            ->with(self::anything(), 102)
            ->willReturn([
                (new UserAgentEntity())->setUserId('collaborator-user'),
                (new UserAgentEntity())->setUserId('revoked-user'),
            ]);
        $userAgentService->expects(self::once())
            ->method('deleteUserAgentOwnershipsByMarketSourceAndUsers')
            ->with(self::anything(), 102, ['revoked-user']);

        $service = $this->createService(
            $marketRepository,
            $this->createVisibilityService(),
            $this->createOperationService([
                'collaborator-user' => ['agent-shared' => Operation::Read],
            ]),
            $userAgentService,
        );

        $service->syncOrganizationMarketHireAccess(
            PermissionDataIsolation::create('ORG', 'admin-user'),
            $market
        );
    }

    private function createService(
        ?AgentMarketRepositoryInterface $marketRepository = null,
        ?ResourceVisibilityDomainService $visibilityService = null,
        ?OperationPermissionDomainService $operationService = null,
        ?UserAgentDomainService $userAgentService = null,
        ?MagicDepartmentUserRepositoryInterface $departmentUserRepository = null,
    ): SuperMagicAgentMarketDomainService {
        return new SuperMagicAgentMarketDomainService(
            $this->createMock(AgentPlaybookRepositoryInterface::class),
            $marketRepository ?? $this->createMock(AgentMarketRepositoryInterface::class),
            $visibilityService ?? $this->createVisibilityService(),
            $operationService ?? $this->createOperationService(),
            $userAgentService ?? $this->createMock(UserAgentDomainService::class),
            $departmentUserRepository ?? $this->createMock(MagicDepartmentUserRepositoryInterface::class),
        );
    }

    /** @param string[] $codes */
    private function createVisibilityService(array $codes = []): ResourceVisibilityDomainService
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
                if ($resourceIds === null) {
                    return $this->codes;
                }

                return array_values(array_intersect($this->codes, $resourceIds));
            }

            public function saveVisibilityByPrincipals(
                BaseDataIsolation|PermissionDataIsolation $dataIsolation,
                ResourceVisibilityResourceType $resourceType,
                string $resourceCode,
                VisibilityType $visibilityType,
                array $userIds = [],
                array $departmentIds = []
            ): void {
            }
        };
    }

    /** @param array<string, array<string, Operation>> $operationMap */
    private function createOperationService(array $operationMap = []): OperationPermissionDomainService
    {
        return new readonly class($operationMap) extends OperationPermissionDomainService {
            public function __construct(private array $operationMap)
            {
            }

            public function getResourceOperationByUserIds(
                PermissionDataIsolation $dataIsolation,
                OperationPermissionResourceType $resourceType,
                array $userIds,
                ?array $resourceIds = []
            ): array {
                if ($resourceIds === []) {
                    return $this->operationMap;
                }

                $result = [];
                foreach ($userIds as $userId) {
                    foreach ($resourceIds ?? [] as $resourceId) {
                        if (isset($this->operationMap[$userId][$resourceId])) {
                            $result[$userId][$resourceId] = $this->operationMap[$userId][$resourceId];
                        }
                    }
                }

                return $result;
            }
        };
    }
}
