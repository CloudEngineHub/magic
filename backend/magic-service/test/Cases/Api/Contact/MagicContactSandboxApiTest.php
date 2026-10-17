<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Api\Contact;

use App\Application\Chat\Service\MagicDepartmentAppService;
use App\Application\Chat\Service\MagicUserContactAppService;
use App\Domain\Contact\DTO\DepartmentQueryDTO;
use App\Domain\Contact\DTO\UserQueryDTO;
use App\Domain\Contact\Entity\MagicDepartmentEntity;
use App\Domain\Contact\Entity\ValueObject\UserQueryType;
use App\ErrorCode\ChatErrorCode;
use App\ErrorCode\PermissionErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Util\Context\RequestCoContext;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\Chat\DTO\UserDetailDTO;
use App\Interfaces\Contact\Facade\Open\MagicContactSandboxApi;
use Hyperf\Context\ApplicationContext;
use Hyperf\Context\Context;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\TranslatorInterface;
use Hyperf\HttpServer\Contract\RequestInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;

/** @internal */
class MagicContactSandboxApiTest extends TestCase
{
    private static bool $minimalContextSet = false;

    protected function tearDown(): void
    {
        Context::set('magic-user-authorization', null);
        parent::tearDown();
    }

    public function testSearchUsersUsesCurrentIdentityAndReturnsOnlyAllowedFields(): void
    {
        $authorization = $this->authorization();
        RequestCoContext::setUserAuthorization($authorization);
        $request = $this->request(['query' => ' Alice ', 'page_token' => '20', 'organization_code' => 'other-org']);
        $users = $this->createMock(MagicUserContactAppService::class);
        $users->expects(self::once())->method('searchDepartmentUser')->with(
            self::callback(static fn (UserQueryDTO $query): bool => $query->getQuery() === 'Alice'
                && $query->getPageToken() === '20'
                && $query->getPageSize() === 20
                && $query->getQueryType() === UserQueryType::User
                && $query->isFilterAgent()),
            $authorization
        )->willReturn([
            'items' => [
                new UserDetailDTO(['user_id' => 'u1', 'organization_code' => 'org-1', 'nickname' => 'Alice', 'real_name' => 'Alice A', 'phone' => '12345678901']),
                new UserDetailDTO(['user_id' => 'u2', 'organization_code' => 'other-org', 'nickname' => 'Other', 'real_name' => 'Other B']),
            ],
            'has_more' => true,
            'page_token' => '40',
        ]);

        $api = new MagicContactSandboxApi($request, $users, $this->createMock(MagicDepartmentAppService::class));
        self::assertSame([
            'items' => [['user_id' => 'u1', 'nickname' => 'Alice', 'real_name' => 'Alice A']],
            'has_more' => true,
            'page_token' => '40',
        ], $api->searchUsers());
    }

    public function testSearchDepartmentsUsesCurrentIdentityAndMarksBoundedCoverage(): void
    {
        $authorization = $this->authorization();
        RequestCoContext::setUserAuthorization($authorization);
        $request = $this->request(['query' => ' Sales ', 'organization_code' => 'other-org']);
        $departments = $this->createMock(MagicDepartmentAppService::class);
        $departments->expects(self::once())->method('searchDepartment')->with(
            self::callback(static fn (DepartmentQueryDTO $query): bool => $query->getQuery() === 'Sales'),
            $authorization
        )->willReturn([
            'items' => [
                new MagicDepartmentEntity(['department_id' => 'd1', 'parent_department_id' => 'root', 'name' => 'Sales', 'organization_code' => 'org-1']),
                new MagicDepartmentEntity(['department_id' => 'd2', 'parent_department_id' => 'root', 'name' => 'Other', 'organization_code' => 'other-org']),
            ],
        ]);

        $api = new MagicContactSandboxApi($request, $this->createMock(MagicUserContactAppService::class), $departments);
        self::assertSame([
            'items' => [['department_id' => 'd1', 'name' => 'Sales', 'parent_department_id' => 'root']],
            'coverage' => 'bounded',
        ], $api->searchDepartments());
    }

    public function testSearchRejectsMissingUserAuthorization(): void
    {
        $this->setMinimalExceptionContext();
        Context::set('magic-user-authorization', null);
        $users = $this->createMock(MagicUserContactAppService::class);
        $users->expects(self::never())->method('searchDepartmentUser');
        $api = new MagicContactSandboxApi($this->request(['query' => 'Alice']), $users, $this->createMock(MagicDepartmentAppService::class));

        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(PermissionErrorCode::AccessDenied->value);
        $api->searchUsers();
    }

    public function testSearchRejectsEmptyQueryBeforeCallingService(): void
    {
        $this->setMinimalExceptionContext();
        RequestCoContext::setUserAuthorization($this->authorization());
        $users = $this->createMock(MagicUserContactAppService::class);
        $users->expects(self::never())->method('searchDepartmentUser');
        $api = new MagicContactSandboxApi($this->request(['query' => '  ']), $users, $this->createMock(MagicDepartmentAppService::class));

        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(ChatErrorCode::INPUT_PARAM_ERROR->value);
        $api->searchUsers();
    }

    public function testSearchRejectsInvalidPageTokenBeforeCallingService(): void
    {
        $this->setMinimalExceptionContext();
        RequestCoContext::setUserAuthorization($this->authorization());
        $users = $this->createMock(MagicUserContactAppService::class);
        $users->expects(self::never())->method('searchDepartmentUser');
        $api = new MagicContactSandboxApi($this->request(['query' => 'Alice', 'page_token' => '-1']), $users, $this->createMock(MagicDepartmentAppService::class));

        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(ChatErrorCode::INPUT_PARAM_ERROR->value);
        $api->searchUsers();
    }

    private function authorization(): MagicUserAuthorization
    {
        $authorization = new MagicUserAuthorization();
        $authorization->setId('caller');
        $authorization->setOrganizationCode('org-1');
        $authorization->setStatus('1');
        return $authorization;
    }

    private function request(array $input): RequestInterface
    {
        $request = $this->createMock(RequestInterface::class);
        $request->method('input')->willReturnCallback(static fn (string $key, mixed $default = null): mixed => $input[$key] ?? $default);
        return $request;
    }

    private function setMinimalExceptionContext(): void
    {
        if (ApplicationContext::hasContainer() && ! self::$minimalContextSet) {
            return;
        }

        $config = $this->createMock(ConfigInterface::class);
        $config->method('get')->with('error_message')->willReturn([
            'exception_class' => BusinessException::class,
            'error_code_mapper' => [
                ChatErrorCode::class => [3000, 3999],
                PermissionErrorCode::class => [42000, 42999],
            ],
        ]);
        $translator = $this->createMock(TranslatorInterface::class);
        $translator->method('trans')->willReturnCallback(static fn (string $key): string => $key);
        $container = $this->createMock(ContainerInterface::class);
        $container->method('get')->willReturnCallback(static fn (string $id): mixed => match ($id) {
            ConfigInterface::class => $config,
            TranslatorInterface::class => $translator,
            default => null,
        });
        ApplicationContext::setContainer($container);
        self::$minimalContextSet = true;
    }
}
