<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Authentication\Service;

use App\ErrorCode\UserErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Qbhy\HyperfAuth\AuthManager;
use Throwable;

/**
 * 共用的鉴权辅助方法，供具体鉴权 AppService 复用。
 */
class AuthBaseAppService
{
    /**
     * 标准用户鉴权（web guard）。
     *
     * @throws Throwable
     */
    protected function authenticateByWebGuard(): MagicUserAuthorization
    {
        try {
            /* @var MagicUserAuthorization $authorization */
            return di(AuthManager::class)->guard(name: 'web')->user();
        } catch (BusinessException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            ExceptionBuilder::throw(UserErrorCode::ACCOUNT_ERROR, throwable: $exception);
        }
    }

    /**
     * 使用显式传入的请求头鉴权，供没有 HTTP Request 上下文的 IPC 调用复用 WebGuard 的凭证语义.
     *
     * @param array<string,mixed> $headers
     *
     * @throws Throwable
     */
    protected function authenticateByHeaders(array $headers): MagicUserAuthorization
    {
        $authorization = $this->getHeaderValue($headers, ['user-authorization', 'authorization']);
        if ($authorization === '') {
            ExceptionBuilder::throw(UserErrorCode::TOKEN_NOT_FOUND);
        }

        $organizationCode = $this->getHeaderValue($headers, ['organization-code']);
        $user = $this->retrieveMagicUserAuthorization($authorization, $organizationCode);
        if (! $user instanceof MagicUserAuthorization) {
            ExceptionBuilder::throw(UserErrorCode::USER_NOT_EXIST);
        }
        if ($user->getOrganizationCode() === '') {
            ExceptionBuilder::throw(UserErrorCode::ORGANIZATION_NOT_EXIST);
        }

        return $user;
    }

    protected function retrieveMagicUserAuthorization(string $authorization, string $organizationCode): ?MagicUserAuthorization
    {
        $user = MagicUserAuthorization::retrieveById([
            'authorization' => $authorization,
            'organizationCode' => $organizationCode,
        ]);

        return $user instanceof MagicUserAuthorization ? $user : null;
    }

    /**
     * @param array<string,mixed> $headers
     * @param array<int,string> $targetHeaders
     */
    private function getHeaderValue(array $headers, array $targetHeaders): string
    {
        $foundHeaders = [];
        foreach ($headers as $headerName => $headerValues) {
            $normalizedName = str_replace('_', '-', strtolower((string) $headerName));
            if (! in_array($normalizedName, $targetHeaders, true)) {
                continue;
            }

            $value = is_array($headerValues) ? ($headerValues[0] ?? '') : $headerValues;
            if ($value !== '') {
                $foundHeaders[$normalizedName] = (string) $value;
            }
        }

        foreach ($targetHeaders as $targetHeader) {
            if (isset($foundHeaders[$targetHeader])) {
                return $foundHeaders[$targetHeader];
            }
        }

        return '';
    }
}
