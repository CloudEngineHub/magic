<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Authentication\Service;

use App\Application\Authentication\Service\AuthSandboxAppService;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use PHPUnit\Framework\TestCase;
use Throwable;

/**
 * @internal
 */
class AuthSandboxAppServiceTest extends TestCase
{
    public function testAuthenticateSkipsWebGuardWhenRequestContextIsUnavailable(): void
    {
        $authorization = $this->createAuthorization();
        $service = $this->createService(useWebGuard: false, headerAuthorization: $authorization);

        $result = $service->authenticate([
            'authorization' => ['Bearer account-token'],
            'user_authorization' => ['Bearer user-token'],
            'organization_code' => ['DT001'],
        ]);

        $this->assertSame($authorization, $result);
        $this->assertSame(0, $service->webGuardCallCount);
        $this->assertSame([
            'authorization' => 'Bearer user-token',
            'organizationCode' => 'DT001',
        ], $service->credentials);
    }

    public function testAuthenticateUsesWebGuardWhenRequestContextIsAvailable(): void
    {
        $authorization = $this->createAuthorization();
        $service = $this->createService(useWebGuard: true, webGuardAuthorization: $authorization);

        $result = $service->authenticate([
            'authorization' => ['Bearer account-token'],
            'organization_code' => ['DT001'],
        ]);

        $this->assertSame($authorization, $result);
        $this->assertSame(1, $service->webGuardCallCount);
        $this->assertSame([], $service->credentials);
    }

    public function testAuthenticateRethrowsWebGuardException(): void
    {
        $service = $this->createService(
            useWebGuard: true,
            webGuardException: new BusinessException('webguard_failed', 1001),
        );

        $this->expectException(BusinessException::class);
        $this->expectExceptionMessage('webguard_failed');
        $this->expectExceptionCode(1001);

        $service->authenticate([
            'authorization' => ['Bearer user-token'],
            'organization_code' => ['DT001'],
        ]);
    }

    public function testAuthenticateRethrowsHeaderException(): void
    {
        $service = $this->createService(
            useWebGuard: false,
            headerException: new BusinessException('headers_failed', 1002),
        );

        $this->expectException(BusinessException::class);
        $this->expectExceptionMessage('headers_failed');
        $this->expectExceptionCode(1002);

        $service->authenticate([
            'authorization' => ['Bearer user-token'],
            'organization_code' => ['DT001'],
        ]);
    }

    private function createAuthorization(): MagicUserAuthorization
    {
        $authorization = new MagicUserAuthorization();
        $authorization->setId('user-1');
        $authorization->setOrganizationCode('DT001');
        return $authorization;
    }

    private function createService(
        bool $useWebGuard,
        ?MagicUserAuthorization $headerAuthorization = null,
        ?MagicUserAuthorization $webGuardAuthorization = null,
        ?Throwable $webGuardException = null,
        ?Throwable $headerException = null,
    ): AuthSandboxAppServiceForTest {
        return new AuthSandboxAppServiceForTest(
            $useWebGuard,
            $headerAuthorization,
            $webGuardAuthorization,
            $webGuardException,
            $headerException,
        );
    }
}

/**
 * @internal
 */
class AuthSandboxAppServiceForTest extends AuthSandboxAppService
{
    /**
     * @var array{authorization?: string, organizationCode?: string}
     */
    public array $credentials = [];

    public int $webGuardCallCount = 0;

    public function __construct(
        private readonly bool $useWebGuard,
        private readonly ?MagicUserAuthorization $headerAuthorization,
        private readonly ?MagicUserAuthorization $webGuardAuthorization,
        private readonly ?Throwable $webGuardException,
        private readonly ?Throwable $headerException,
    ) {
    }

    protected function hasRequestContext(): bool
    {
        return $this->useWebGuard;
    }

    protected function authenticateByWebGuard(): MagicUserAuthorization
    {
        ++$this->webGuardCallCount;

        if ($this->webGuardException instanceof Throwable) {
            throw $this->webGuardException;
        }

        if ($this->webGuardAuthorization instanceof MagicUserAuthorization) {
            return $this->webGuardAuthorization;
        }

        throw new BusinessException('webguard_failed', 1001);
    }

    protected function retrieveMagicUserAuthorization(string $authorization, string $organizationCode): ?MagicUserAuthorization
    {
        $this->credentials = [
            'authorization' => $authorization,
            'organizationCode' => $organizationCode,
        ];

        if ($this->headerException instanceof Throwable) {
            throw $this->headerException;
        }

        return $this->headerAuthorization;
    }
}
