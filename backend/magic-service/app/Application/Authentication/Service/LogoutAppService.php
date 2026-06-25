<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Authentication\Service;

use App\Domain\Token\Entity\MagicTokenEntity;
use App\Domain\Token\Entity\ValueObject\MagicTokenType;
use App\Domain\Token\Repository\Facade\MagicTokenRepositoryInterface;
use App\ErrorCode\UserErrorCode;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutContext;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutInterface;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutResult;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\Auth\WebSessionAuthCache;
use App\Infrastructure\Util\RequestUtil;
use App\Interfaces\Authentication\DTO\LogoutSessionRequest;
use App\Interfaces\Authentication\DTO\LogoutSessionResponse;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\Logger\LoggerFactory;
use Hyperf\Redis\Redis;
use Throwable;

readonly class LogoutAppService
{
    public function __construct(
        private MagicTokenRepositoryInterface $tokenRepository,
        private ExternalSessionLogoutInterface $externalSessionLogout,
        private Redis $redis,
        private LoggerFactory $loggerFactory,
    ) {
    }

    public function logout(MagicUserAuthorization $userAuthorization, LogoutSessionRequest $request): LogoutSessionResponse
    {
        $organizationCode = $request->getOrganizationCode() !== ''
            ? $request->getOrganizationCode()
            : $userAuthorization->getOrganizationCode();
        $rawAuthorization = trim($request->getAuthorization());
        $normalizedAuthorization = RequestUtil::parseAuthorizationToken($rawAuthorization);
        if ($normalizedAuthorization === '') {
            ExceptionBuilder::throw(UserErrorCode::TOKEN_NOT_FOUND);
        }

        $shortToken = MagicTokenEntity::getShortToken($normalizedAuthorization);
        $resolvedToken = $this->tokenRepository->getTokenEntityByToken($shortToken);
        if ($resolvedToken !== null && $resolvedToken->getType() !== MagicTokenType::Account) {
            return $this->createResponse(
                sessionRevoked: false,
                externalSessionLogoutResult: ExternalSessionLogoutResult::skipped('token_type_mismatch')
            );
        }

        $validAccountToken = $resolvedToken?->getType() === MagicTokenType::Account
            ? $resolvedToken
            : $this->tokenRepository->queryTokenEntity(MagicTokenType::Account, $shortToken);
        $accountToken = $validAccountToken
            ?? $this->tokenRepository->queryTokenEntity(MagicTokenType::Account, $shortToken, false);

        $externalSessionLogoutResult = $this->logoutExternalSession(
            $userAuthorization,
            $normalizedAuthorization,
            $shortToken,
            $request->getDevice(),
            $organizationCode,
            $request->getApiKey(),
            $accountToken
        );

        if ($accountToken !== null) {
            $this->tokenRepository->deleteToken($accountToken);
        }
        $this->deleteAuthCache($rawAuthorization, $normalizedAuthorization, $organizationCode, $request->getApiKey());

        return $this->createResponse($validAccountToken !== null, $externalSessionLogoutResult);
    }

    private function logoutExternalSession(
        MagicUserAuthorization $userAuthorization,
        string $authorization,
        string $shortToken,
        array $device,
        string $organizationCode,
        string $apiKey,
        ?MagicTokenEntity $tokenEntity
    ): ExternalSessionLogoutResult {
        try {
            return $this->externalSessionLogout->logout(new ExternalSessionLogoutContext(
                authorization: $authorization,
                shortToken: $shortToken,
                device: $device,
                organizationCode: $organizationCode,
                apiKey: $apiKey,
                magicId: $tokenEntity?->getTypeRelationValue() ?: $userAuthorization->getMagicId(),
                magicEnvId: (int) ($tokenEntity?->getExtra()?->getMagicEnvId() ?? $userAuthorization->getMagicEnvId()),
                tokenId: $tokenEntity?->getId() ?? 0
            ));
        } catch (Throwable $throwable) {
            $this->loggerFactory->get(self::class)->warning('External session logout failed unexpectedly', [
                'organization_code' => $organizationCode,
                'token_id' => $tokenEntity?->getId(),
                'error' => $throwable->getMessage(),
            ]);
            return ExternalSessionLogoutResult::failed('external_logout_exception');
        }
    }

    private function deleteAuthCache(
        string $rawAuthorization,
        string $normalizedAuthorization,
        string $organizationCode,
        string $apiKey
    ): void {
        $authorizations = array_unique(array_filter([$rawAuthorization, $normalizedAuthorization]));
        foreach ($authorizations as $authorization) {
            $this->redis->del(WebSessionAuthCache::authUserKey($authorization, $organizationCode, $apiKey));
        }
    }

    private function createResponse(bool $sessionRevoked, ExternalSessionLogoutResult $externalSessionLogoutResult): LogoutSessionResponse
    {
        $response = new LogoutSessionResponse();
        $response->setSessionRevoked($sessionRevoked);
        $response->setExternalSessionLogout($externalSessionLogoutResult->getStatus());
        $response->setExternalSessionLogoutReason($externalSessionLogoutResult->getReason());
        return $response;
    }
}
