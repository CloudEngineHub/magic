<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Authentication\Facade;

use App\Application\Authentication\Service\LogoutAppService;
use App\ErrorCode\UserErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\RequestUtil;
use App\Interfaces\Authentication\DTO\LogoutSessionRequest;
use App\Interfaces\Authentication\DTO\LogoutSessionResponse;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;

#[ApiResponse(version: 'low_code')]
class LogoutApi extends AbstractApi
{
    #[Inject]
    protected LogoutAppService $logoutAppService;

    /**
     * 退出当前 Web 会话.
     */
    public function logout(): LogoutSessionResponse
    {
        $userAuthorization = $this->checkAndGetAuthorization();
        if (! $userAuthorization instanceof MagicUserAuthorization) {
            ExceptionBuilder::throw(UserErrorCode::ACCOUNT_ERROR);
        }

        $logoutRequest = new LogoutSessionRequest();
        $logoutRequest->setAuthorization($this->getSessionAuthorizationHeader($this->request->getHeaders()));
        $logoutRequest->setDevice($this->request->input('device', []));
        $logoutRequest->setOrganizationCode((string) $this->request->header('organization-code', ''));
        $logoutRequest->setApiKey(RequestUtil::getApiKeyHeader($this->request->getHeaders()));

        return $this->logoutAppService->logout($userAuthorization, $logoutRequest);
    }

    private function getSessionAuthorizationHeader(array $headers): string
    {
        $targetHeaders = ['user-authorization', 'authorization'];
        $foundHeaders = [];

        foreach ($headers as $headerName => $headerValues) {
            $normalizedName = str_replace('_', '-', strtolower((string) $headerName));
            if (! in_array($normalizedName, $targetHeaders, true)) {
                continue;
            }

            $value = is_array($headerValues) && ! empty($headerValues)
                ? (string) $headerValues[0]
                : (string) $headerValues;
            if ($value !== '') {
                $foundHeaders[$normalizedName] = $value;
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
