<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Api\Contact;

use App\Application\Contact\Service\MagicUserOrganizationAppService;
use App\Application\Contact\Service\MagicUserSettingAppService;
use App\Application\Contact\Support\OrganizationProductResolver;
use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\Contact\Entity\ValueObject\UserStatus;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Domain\OrganizationEnvironment\Entity\OrganizationEntity;
use App\Domain\OrganizationEnvironment\Repository\Facade\OrganizationRepositoryInterface;
use App\Domain\OrganizationEnvironment\Service\OrganizationDomainService;
use App\Domain\Permission\Service\OrganizationAdminDomainService;
use App\Interfaces\Chat\DTO\UserDetailDTO;
use PHPUnit\Framework\TestCase;
use ReflectionProperty;

/**
 * @internal
 */
class MagicUserOrganizationAppServiceTest extends TestCase
{
    public function testGetOrganizationsByAuthorizationSkipsInactiveContactUsers(): void
    {
        $authorization = 'account-token';
        $magicId = 'magic-1';

        $userDomainService = $this->createMock(MagicUserDomainService::class);
        $userDomainService->expects($this->once())
            ->method('getUsersDetailByAccountFromAuthorization')
            ->with($authorization)
            ->willReturn([
                new UserDetailDTO([
                    'magic_id' => $magicId,
                    'user_id' => 'user-active',
                    'organization_code' => 'org-active',
                    'status' => UserStatus::Activated->value,
                ]),
                new UserDetailDTO([
                    'magic_id' => $magicId,
                    'user_id' => 'user-exited',
                    'organization_code' => 'org-exited',
                    'status' => UserStatus::Exited->value,
                ]),
            ]);

        $organizationRepository = $this->createMock(OrganizationRepositoryInterface::class);
        $organizationRepository->expects($this->once())
            ->method('getByCodes')
            ->with(['org-active'])
            ->willReturn([
                new OrganizationEntity([
                    'magic_organization_code' => 'org-active',
                    'name' => 'Active Org',
                    'type' => 0,
                    'logo' => null,
                    'seats' => 10,
                    'status' => 1,
                ]),
            ]);
        $organizationDomainService = new OrganizationDomainService(
            $organizationRepository,
            $this->createMock(MagicUserDomainService::class),
            $this->createMock(OrganizationAdminDomainService::class)
        );

        $userSettingAppService = $this->createMock(MagicUserSettingAppService::class);
        $userSettingAppService->expects($this->once())
            ->method('getCurrentOrganizationDataByMagicId')
            ->with($magicId)
            ->willReturn([
                'magic_organization_code' => 'org-active',
            ]);

        $organizationAdminDomainService = $this->createMock(OrganizationAdminDomainService::class);
        $organizationAdminDomainService->expects($this->once())
            ->method('isOrganizationAdmin')
            ->with($this->isInstanceOf(DataIsolation::class), 'user-active')
            ->willReturn(false);
        $organizationAdminDomainService->expects($this->once())
            ->method('isOrganizationCreator')
            ->with($this->isInstanceOf(DataIsolation::class), 'user-active')
            ->willReturn(false);

        $organizationProductResolver = $this->createMock(OrganizationProductResolver::class);
        $organizationProductResolver->expects($this->once())
            ->method('resolveSubscriptionInfo')
            ->with('org-active', 'user-active')
            ->willReturn([
                'product_name' => null,
                'plan_type' => null,
                'subscription_tier' => null,
            ]);

        $service = new MagicUserOrganizationAppService();
        $this->inject($service, 'userDomainService', $userDomainService);
        $this->inject($service, 'userSettingAppService', $userSettingAppService);
        $this->inject($service, 'organizationDomainService', $organizationDomainService);
        $this->inject($service, 'organizationAdminDomainService', $organizationAdminDomainService);
        $this->inject($service, 'organizationProductResolver', $organizationProductResolver);

        $result = $service->getOrganizationsByAuthorization($authorization);

        $items = $result->getItems();
        $this->assertCount(1, $items);
        $this->assertSame('org-active', $items[0]->getMagicOrganizationCode());
        $this->assertTrue($items[0]->isCurrent());
    }

    private function inject(object $target, string $property, object $value): void
    {
        $reflectionProperty = new ReflectionProperty($target, $property);
        $reflectionProperty->setValue($target, $value);
    }
}
