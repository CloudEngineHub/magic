<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Interfaces\Authentication\Facade;

use App\Application\Authentication\Service\LogoutAppService;
use App\Domain\Token\Entity\MagicTokenEntity;
use App\Domain\Token\Entity\ValueObject\MagicTokenType;
use App\Domain\Token\Repository\Facade\MagicTokenRepositoryInterface;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutContext;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutInterface;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutResult;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Interfaces\Authentication\DTO\LogoutSessionResponse;
use App\Interfaces\Authentication\Facade\LogoutApi;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\HttpServer\Contract\RequestInterface;
use Hyperf\Logger\LoggerFactory;
use Hyperf\Redis\Redis;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Qbhy\HyperfAuth\Authenticatable;
use Throwable;

/**
 * @internal
 */
class LogoutApiTest extends TestCase
{
    public function testLogoutBuildsRequestAndDelegatesToAppService(): void
    {
        $userAuthorization = $this->createUserAuthorization();

        $shortToken = MagicTokenEntity::getShortToken('account-token-001');
        $tokenEntity = $this->createTokenEntity($shortToken);

        $tokenRepository = $this->createMock(MagicTokenRepositoryInterface::class);
        $tokenRepository->expects($this->once())
            ->method('getTokenEntityByToken')
            ->with($shortToken)
            ->willReturn($tokenEntity);
        $tokenRepository->expects($this->once())->method('deleteToken')->with($tokenEntity);

        $externalLogout = $this->createMock(ExternalSessionLogoutInterface::class);
        $externalLogout->expects($this->once())
            ->method('logout')
            ->with($this->callback(
                static fn (ExternalSessionLogoutContext $context): bool => $context->getAuthorization() === 'account-token-001'
                    && $context->getDevice() === ['id' => 'device-001']
                    && $context->getOrganizationCode() === 'ORG001'
                    && $context->getApiKey() === 'api-key-001'
                    && $context->getMagicId() === 'magic_001'
                    && $context->getTokenId() === 1001
            ))
            ->willReturn(ExternalSessionLogoutResult::success());

        $redis = $this->createRedisMock(2);
        $logoutAppService = $this->createLogoutAppService($tokenRepository, $externalLogout, $redis);

        $api = new LogoutApiForTest($this->createRequest(['id' => 'device-001']), $logoutAppService, $userAuthorization);

        $response = $api->logout();

        $this->assertLogoutResponse($response, true, ExternalSessionLogoutResult::STATUS_SUCCESS);
    }

    public function testLogoutPropagatesWebGuardAuthenticationError(): void
    {
        $exception = new BusinessException('authorization invalid', 3103);

        $tokenRepository = $this->createMock(MagicTokenRepositoryInterface::class);
        $tokenRepository->expects($this->never())->method('getTokenEntityByToken');

        $logoutAppService = $this->createLogoutAppService(
            $tokenRepository,
            $this->createMock(ExternalSessionLogoutInterface::class),
            $this->createRedisMock(0, false)
        );

        $api = new LogoutApiForTest($this->createRequest(), $logoutAppService, null, $exception);

        $this->expectExceptionObject($exception);
        $api->logout();
    }

    private function createRequest(array $device = []): RequestInterface
    {
        $request = $this->createMock(RequestInterface::class);
        $request->method('input')
            ->with('device', [])
            ->willReturn($device);
        $request->method('getHeaders')->willReturn([
            'authorization' => ['Bearer account-token-001'],
            'api-key' => ['api-key-001'],
        ]);
        $request->method('header')->willReturnCallback(
            static fn (string $name, mixed $default = null): mixed => $name === 'organization-code' ? 'ORG001' : $default
        );

        return $request;
    }

    private function createUserAuthorization(): MagicUserAuthorization
    {
        $authorization = new MagicUserAuthorization();
        $authorization->setId('user_001');
        $authorization->setMagicId('magic_001');
        $authorization->setOrganizationCode('ORG001');

        return $authorization;
    }

    private function createLogoutAppService(
        MagicTokenRepositoryInterface $tokenRepository,
        ExternalSessionLogoutInterface $externalLogout,
        Redis $redis
    ): LogoutAppService {
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn($this->createMock(LoggerInterface::class));

        return new LogoutAppService($tokenRepository, $externalLogout, $redis, $loggerFactory);
    }

    private function createRedisMock(int $deleteCount, bool $expectsDelete = true): Redis
    {
        $redis = $this->getMockBuilder(Redis::class)
            ->disableOriginalConstructor()
            ->addMethods(['del'])
            ->getMock();

        if (! $expectsDelete) {
            $redis->expects($this->never())->method('del');
            return $redis;
        }

        $redis->expects($this->exactly($deleteCount))->method('del')->willReturn(1);

        return $redis;
    }

    private function createTokenEntity(string $shortToken): MagicTokenEntity
    {
        $entity = new MagicTokenEntity();
        $entity->setId(1001);
        $entity->setType(MagicTokenType::Account);
        $entity->setTypeRelationValue('magic_001');
        $entity->setToken($shortToken);
        $entity->setExpiredAt('2099-01-01 00:00:00');

        return $entity;
    }

    private function assertLogoutResponse(
        LogoutSessionResponse $response,
        bool $sessionRevoked,
        string $externalSessionLogout,
        string $externalSessionLogoutReason = ''
    ): void {
        $this->assertSame($sessionRevoked, $response->isSessionRevoked());
        $this->assertSame($externalSessionLogout, $response->getExternalSessionLogout());
        $this->assertSame($externalSessionLogoutReason, $response->getExternalSessionLogoutReason());
    }
}

/**
 * @internal
 */
class LogoutApiForTest extends LogoutApi
{
    public function __construct(
        RequestInterface $request,
        LogoutAppService $logoutAppService,
        private readonly ?MagicUserAuthorization $authorization = null,
        private readonly ?Throwable $authorizationException = null,
    ) {
        parent::__construct($request);
        $this->logoutAppService = $logoutAppService;
    }

    protected function checkAndGetAuthorization(): Authenticatable
    {
        if ($this->authorizationException instanceof Throwable) {
            throw $this->authorizationException;
        }

        return $this->authorization ?? new MagicUserAuthorization();
    }
}
