<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Authentication\Service;

use App\Application\Authentication\Service\LogoutAppService;
use App\Domain\Token\Entity\MagicTokenEntity;
use App\Domain\Token\Entity\ValueObject\MagicTokenType;
use App\Domain\Token\Repository\Facade\MagicTokenRepositoryInterface;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutContext;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutInterface;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutResult;
use App\Infrastructure\Util\Auth\WebSessionAuthCache;
use App\Interfaces\Authentication\DTO\LogoutSessionRequest;
use App\Interfaces\Authentication\DTO\LogoutSessionResponse;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\Logger\LoggerFactory;
use Hyperf\Redis\Redis;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use RuntimeException;

/**
 * @internal
 */
class LogoutAppServiceTest extends TestCase
{
    public function testLogoutRevokesAccountTokenAndDelegatesExternalSession(): void
    {
        $rawAuthorization = 'Bearer account-token-001';
        $normalizedAuthorization = 'account-token-001';
        $shortToken = MagicTokenEntity::getShortToken($normalizedAuthorization);
        $organizationCode = 'ORG001';
        $apiKey = 'api-key-001';
        $device = ['id' => 'device-001'];
        $tokenEntity = $this->createTokenEntity(MagicTokenType::Account, $shortToken, '2099-01-01 00:00:00');

        $tokenRepository = $this->createMock(MagicTokenRepositoryInterface::class);
        $tokenRepository->expects($this->once())
            ->method('getTokenEntityByToken')
            ->with($shortToken)
            ->willReturn($tokenEntity);
        $tokenRepository->expects($this->never())->method('queryTokenEntity');
        $tokenRepository->expects($this->once())
            ->method('deleteToken')
            ->with($tokenEntity);

        $externalLogout = $this->createMock(ExternalSessionLogoutInterface::class);
        $externalLogout->expects($this->once())
            ->method('logout')
            ->with($this->callback(
                static fn (ExternalSessionLogoutContext $context): bool => $context->getAuthorization() === $normalizedAuthorization
                    && $context->getShortToken() === $shortToken
                    && $context->getDevice() === $device
                    && $context->getOrganizationCode() === $organizationCode
                    && $context->getApiKey() === $apiKey
                    && $context->getMagicId() === $tokenEntity->getTypeRelationValue()
                    && $context->getTokenId() === $tokenEntity->getId()
            ))
            ->willReturn(ExternalSessionLogoutResult::success());

        $expectedDeletedKeys = [
            WebSessionAuthCache::authUserKey($rawAuthorization, $organizationCode, $apiKey),
            WebSessionAuthCache::authUserKey($normalizedAuthorization, $organizationCode, $apiKey),
        ];
        $deletedKeys = [];
        $redis = $this->createRedisMock($shortToken, count($expectedDeletedKeys), $deletedKeys);

        $service = $this->createService($tokenRepository, $externalLogout, $redis);
        $userAuthorization = $this->createUserAuthorization($organizationCode);

        $response = $service->logout($userAuthorization, $this->createLogoutRequest($rawAuthorization, $device, $organizationCode, $apiKey));

        $this->assertLogoutResponse($response, true, ExternalSessionLogoutResult::STATUS_SUCCESS);
        $this->assertEqualsCanonicalizing($expectedDeletedKeys, $deletedKeys);
    }

    public function testLogoutSkipsNonAccountToken(): void
    {
        $authorization = 'personal-token-001';
        $shortToken = MagicTokenEntity::getShortToken($authorization);
        $tokenEntity = $this->createTokenEntity(MagicTokenType::PersonalAccessToken, $shortToken, '2099-01-01 00:00:00');

        $tokenRepository = $this->createMock(MagicTokenRepositoryInterface::class);
        $tokenRepository->expects($this->once())
            ->method('getTokenEntityByToken')
            ->with($shortToken)
            ->willReturn($tokenEntity);
        $tokenRepository->expects($this->never())->method('queryTokenEntity');
        $tokenRepository->expects($this->never())->method('deleteToken');

        $externalLogout = $this->createMock(ExternalSessionLogoutInterface::class);
        $externalLogout->expects($this->never())->method('logout');

        $deletedKeys = [];
        $redis = $this->createRedisMock($shortToken, 0, $deletedKeys, false);
        $service = $this->createService($tokenRepository, $externalLogout, $redis);
        $userAuthorization = $this->createUserAuthorization();

        $response = $service->logout($userAuthorization, $this->createLogoutRequest($authorization));

        $this->assertLogoutResponse($response, false, ExternalSessionLogoutResult::STATUS_SKIPPED, 'token_type_mismatch');
    }

    public function testLogoutStillRevokesMagicTokenWhenExternalSessionThrows(): void
    {
        $authorization = 'account-token-002';
        $shortToken = MagicTokenEntity::getShortToken($authorization);
        $tokenEntity = $this->createTokenEntity(MagicTokenType::Account, $shortToken, '2099-01-01 00:00:00');

        $tokenRepository = $this->createMock(MagicTokenRepositoryInterface::class);
        $tokenRepository->expects($this->once())
            ->method('getTokenEntityByToken')
            ->with($shortToken)
            ->willReturn($tokenEntity);
        $tokenRepository->expects($this->once())
            ->method('deleteToken')
            ->with($tokenEntity);

        $externalLogout = $this->createMock(ExternalSessionLogoutInterface::class);
        $externalLogout->expects($this->once())
            ->method('logout')
            ->willThrowException(new RuntimeException('network timeout'));

        $expectedDeletedKeys = [WebSessionAuthCache::authUserKey($authorization)];
        $deletedKeys = [];
        $redis = $this->createRedisMock($shortToken, count($expectedDeletedKeys), $deletedKeys);

        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects($this->once())
            ->method('warning')
            ->with('External session logout failed unexpectedly', $this->isType('array'));

        $service = $this->createService($tokenRepository, $externalLogout, $redis, $logger);
        $userAuthorization = $this->createUserAuthorization();

        $response = $service->logout($userAuthorization, $this->createLogoutRequest($authorization));

        $this->assertLogoutResponse($response, true, ExternalSessionLogoutResult::STATUS_FAILED, 'external_logout_exception');
        $this->assertEqualsCanonicalizing($expectedDeletedKeys, $deletedKeys);
    }

    private function createService(
        MagicTokenRepositoryInterface $tokenRepository,
        ExternalSessionLogoutInterface $externalLogout,
        Redis $redis,
        ?LoggerInterface $logger = null
    ): LogoutAppService {
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn($logger ?? $this->createMock(LoggerInterface::class));

        return new LogoutAppService($tokenRepository, $externalLogout, $redis, $loggerFactory);
    }

    /**
     * @param string[] $deletedKeys
     */
    private function createRedisMock(string $shortToken, int $expectedDeleteCount, array &$deletedKeys, bool $expectsDelete = true): Redis
    {
        $redis = $this->getMockBuilder(Redis::class)
            ->disableOriginalConstructor()
            ->addMethods(['del'])
            ->getMock();

        if (! $expectsDelete) {
            $redis->expects($this->never())->method('del');
            return $redis;
        }

        $redis->expects($this->exactly($expectedDeleteCount))
            ->method('del')
            ->willReturnCallback(static function (string $key) use (&$deletedKeys): int {
                $deletedKeys[] = $key;
                return 1;
            });

        return $redis;
    }

    private function createLogoutRequest(
        string $authorization,
        array $device = [],
        string $organizationCode = '',
        string $apiKey = ''
    ): LogoutSessionRequest {
        $request = new LogoutSessionRequest();
        $request->setAuthorization($authorization);
        $request->setDevice($device);
        $request->setOrganizationCode($organizationCode);
        $request->setApiKey($apiKey);
        return $request;
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

    private function createTokenEntity(MagicTokenType $type, string $token, string $expiredAt): MagicTokenEntity
    {
        $entity = new MagicTokenEntity();
        $entity->setId(1001);
        $entity->setType($type);
        $entity->setTypeRelationValue('magic_001');
        $entity->setToken($token);
        $entity->setExpiredAt($expiredAt);

        return $entity;
    }

    private function createUserAuthorization(string $organizationCode = ''): MagicUserAuthorization
    {
        $authorization = new MagicUserAuthorization();
        $authorization->setId('user_001');
        $authorization->setMagicId('magic_001');
        $authorization->setOrganizationCode($organizationCode);

        return $authorization;
    }
}
