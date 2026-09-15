<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Chat;

use App\Application\Chat\Service\MagicUserContactAppService;
use App\Domain\Contact\Entity\MagicDepartmentUserEntity;
use App\Domain\Contact\Repository\Facade\MagicDepartmentUserRepositoryInterface;
use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Interfaces\Chat\DTO\UserDetailDTO;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
class MagicUserContactAppServiceTest extends TestCase
{
    public function testGetUsersDetailByAccountAuthorizationAppendsEmployeeNo(): void
    {
        $users = [
            new UserDetailDTO([
                'user_id' => 'user-1',
                'organization_code' => 'org-1',
            ]),
            new UserDetailDTO([
                'user_id' => 'user-2',
                'organization_code' => 'org-2',
            ]),
        ];

        /** @var MagicUserDomainService&MockObject $userDomainService */
        $userDomainService = $this->createMock(MagicUserDomainService::class);
        $userDomainService->expects($this->once())
            ->method('getUsersDetailByAccountFromAuthorization')
            ->with('account-token', null)
            ->willReturn($users);

        $departmentUserRepository = $this->createMock(MagicDepartmentUserRepositoryInterface::class);
        $departmentUserRepository->expects($this->once())
            ->method('getDepartmentUsersByUserIdsInMagic')
            ->with(['user-1', 'user-2'])
            ->willReturn([
                new MagicDepartmentUserEntity([
                    'user_id' => 'user-1',
                    'organization_code' => 'org-1',
                    'employee_no' => 'EMP001',
                ]),
                new MagicDepartmentUserEntity([
                    'user_id' => 'user-2',
                    'organization_code' => 'org-2',
                    'employee_no' => '',
                ]),
            ]);

        $service = $this->createService(
            $userDomainService,
            new MagicDepartmentUserDomainService($departmentUserRepository)
        );

        $result = $service->getUsersDetailByAccountAuthorization('account-token');

        $this->assertSame('EMP001', $result['items'][0]->getEmployeeNo());
        $this->assertSame('', $result['items'][1]->getEmployeeNo());
        $this->assertSame('EMP001', $result['items'][0]->toArray()['employee_no']);
    }

    private function createService(
        MagicUserDomainService $userDomainService,
        MagicDepartmentUserDomainService $departmentUserDomainService
    ): MagicUserContactAppService {
        $reflection = new ReflectionClass(MagicUserContactAppService::class);
        /** @var MagicUserContactAppService $service */
        $service = $reflection->newInstanceWithoutConstructor();

        $userDomainServiceProperty = $reflection->getProperty('userDomainService');
        $userDomainServiceProperty->setValue($service, $userDomainService);

        $departmentUserDomainServiceProperty = $reflection->getProperty('departmentUserDomainService');
        $departmentUserDomainServiceProperty->setValue($service, $departmentUserDomainService);

        return $service;
    }
}
