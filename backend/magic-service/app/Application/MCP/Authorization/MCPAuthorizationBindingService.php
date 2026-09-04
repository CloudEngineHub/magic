<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MCP\Authorization;

use App\Application\MCP\Authorization\Flow\MCPAuthorizationTokenClient;
use App\Application\MCP\Authorization\State\MCPAuthorizationStateStore;
use App\Domain\MCP\Entity\MCPAuthorizationCredentialEntity;
use App\Domain\MCP\Entity\ValueObject\MCPDataIsolation;
use App\Domain\MCP\Service\MCPAuthorizationCredentialDomainService;
use App\Domain\MCP\Service\MCPServerDomainService;
use App\ErrorCode\MCPErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use GuzzleHttp\Client;
use Qbhy\HyperfAuth\Authenticatable;
use RuntimeException;

/**
 * MCP Authorization 回调绑定服务。
 */
class MCPAuthorizationBindingService
{
    private MCPAuthorizationTokenClient $tokenClient;

    public function __construct(
        private readonly MCPAuthorizationStateStore $stateStore,
        private readonly MCPAuthorizationCredentialDomainService $credentialDomainService,
        private readonly MCPAuthorizationAppService $authorizationAppService,
        private readonly MCPAuthorizationSecretCipher $secretCipher,
        private readonly MCPServerDomainService $mcpServerDomainService
    ) {
        $this->tokenClient = new MCPAuthorizationTokenClient(new Client());
    }

    /**
     * 消费回调参数并保存新模式凭据。
     *
     * @return array<string, mixed>
     */
    public function bind(Authenticatable $authorization, string $code, string $state, ?string $iss = null, ?string $error = null): array
    {
        if ($error !== null && $error !== '') {
            throw new RuntimeException('MCP authorization was denied: ' . $error);
        }
        if ($code === '' || $state === '') {
            ExceptionBuilder::throw(MCPErrorCode::MCPAuthorizationStateInvalid);
        }

        $stateData = $this->stateStore->consume($state);
        if (! $stateData || (string) ($stateData['user_id'] ?? '') !== (string) $authorization->getId()) {
            ExceptionBuilder::throw(MCPErrorCode::MCPAuthorizationStateInvalid);
        }
        $issuer = (string) ($stateData['issuer'] ?? '');
        if ($iss !== null && $iss !== '' && $iss !== $issuer) {
            ExceptionBuilder::throw(MCPErrorCode::MCPAuthorizationIssuerMismatch);
        }

        $dataIsolation = $this->createDataIsolation($authorization);
        if ($dataIsolation->getCurrentOrganizationCode() !== (string) ($stateData['organization_code'] ?? '')) {
            ExceptionBuilder::throw(MCPErrorCode::MCPAuthorizationStateInvalid);
        }
        $serverCode = (string) ($stateData['mcp_server_code'] ?? '');
        $server = $this->mcpServerDomainService->getByCode($dataIsolation, $serverCode);
        if (! $server) {
            ExceptionBuilder::throw(MCPErrorCode::NotFound, 'common.not_found', ['label' => $serverCode]);
        }

        $config = $this->authorizationAppService->getConfig($server);
        $tokenEndpoint = (string) ($stateData['metadata']['authorization_server']['token_endpoint'] ?? $config->getTokenEndpoint());
        if ($tokenEndpoint === '') {
            ExceptionBuilder::throw(MCPErrorCode::MCPAuthorizationTokenExchangeFailed);
        }
        $config->setClientId((string) ($stateData['client_id'] ?? $config->getClientId()));
        $config->setClientSecret($this->secretCipher->decrypt($stateData['client_secret_ciphertext'] ?? null));
        $config->setTokenEndpointAuthMethod((string) ($stateData['token_endpoint_auth_method'] ?? $config->getTokenEndpointAuthMethod()));
        $tokens = $this->tokenClient->exchangeCode(
            $tokenEndpoint,
            $config,
            $code,
            (string) $stateData['redirect_uri'],
            (string) $stateData['code_verifier'],
            (string) $stateData['resource']
        );

        $credential = new MCPAuthorizationCredentialEntity();
        $credential->setOrganizationCode($dataIsolation->getCurrentOrganizationCode());
        $credential->setUserId((string) $stateData['user_id']);
        $credential->setMcpServerId($serverCode);
        $credential->setResource((string) $stateData['resource']);
        $credential->setIssuer($issuer);
        $credential->setRegistrationMode((string) ($stateData['registration_mode'] ?? 'pre_registered'));
        $credential->setClientId((string) ($stateData['client_id'] ?? $config->getClientId()));
        $credential->setClientSecretCiphertext($config->getClientSecret() !== '' ? $this->secretCipher->encrypt($config->getClientSecret()) : null);
        $credential->setTokenEndpointAuthMethod($config->getTokenEndpointAuthMethod() ?: (! empty($config->getClientSecret()) ? 'client_secret_basic' : 'none'));
        $credential->setDiscoveryMetadata(is_array($stateData['metadata'] ?? null) ? $stateData['metadata'] : []);
        $credential->setClientMetadata(['client_id' => $credential->getClientId(), 'registration_mode' => $credential->getRegistrationMode()]);
        $this->authorizationAppService->applyTokenSet($credential, $tokens);
        $this->credentialDomainService->save($dataIsolation, $credential);

        return [
            'success' => true,
            'data' => [
                'auth_info' => [
                    'is_authenticated' => true,
                    'scope' => $credential->getScope(),
                    'token_type' => $credential->getTokenType(),
                    'access_token_expires_at' => $credential->getExpiresAt()?->format('Y-m-d H:i:s'),
                ],
            ],
        ];
    }

    /**
     * 删除新模式凭据，不影响旧 OAuth2 数据。
     */
    public function unbind(Authenticatable $authorization, string $mcpServerCode, ?string $issuer = null): array
    {
        if ($mcpServerCode === '') {
            ExceptionBuilder::throw(MCPErrorCode::ValidateFailed, 'common.empty', ['label' => 'mcp_server_code']);
        }
        $dataIsolation = $this->createDataIsolation($authorization);
        $deleted = $issuer !== null && $issuer !== ''
            ? $this->credentialDomainService->deleteByIssuer($dataIsolation, $authorization->getId(), $mcpServerCode, $issuer)
            : $this->credentialDomainService->deleteByServer($dataIsolation, $authorization->getId(), $mcpServerCode);
        return ['success' => true, 'data' => ['deleted' => $deleted]];
    }

    /**
     * 根据 Web 鉴权对象构造 MCP 数据隔离。
     */
    private function createDataIsolation(Authenticatable $authorization): MCPDataIsolation
    {
        if (! $authorization instanceof MagicUserAuthorization) {
            throw new RuntimeException('MCP authorization requires web user authentication');
        }
        return MCPDataIsolation::create($authorization->getOrganizationCode(), $authorization->getId());
    }
}
