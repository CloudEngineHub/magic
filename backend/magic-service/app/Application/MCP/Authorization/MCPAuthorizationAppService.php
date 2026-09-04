<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MCP\Authorization;

use App\Application\MCP\Authorization\Discovery\MCPAuthorizationDiscoveryClient;
use App\Application\MCP\Authorization\Flow\MCPAuthorizationTokenClient;
use App\Application\MCP\Authorization\State\MCPAuthorizationStateStore;
use App\Domain\MCP\Entity\MCPAuthorizationCredentialEntity;
use App\Domain\MCP\Entity\MCPServerEntity;
use App\Domain\MCP\Entity\ValueObject\Authorization\MCPAuthorizationConfig;
use App\Domain\MCP\Entity\ValueObject\MCPDataIsolation;
use App\Domain\MCP\Entity\ValueObject\ServiceConfig\ExternalSSEServiceConfig;
use App\Domain\MCP\Service\MCPAuthorizationCredentialDomainService;
use App\ErrorCode\MCPErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use GuzzleHttp\Client;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Qbhy\HyperfAuth\Authenticatable;
use RuntimeException;
use Throwable;

/**
 * MCP 2026-07-28 Authorization 应用服务。
 */
class MCPAuthorizationAppService
{
    private LoggerInterface $logger;

    private MCPAuthorizationDiscoveryClient $discoveryClient;

    private MCPAuthorizationTokenClient $tokenClient;

    private MCPAuthorizationPreflightService $preflightService;

    public function __construct(
        private readonly MCPAuthorizationCredentialDomainService $credentialDomainService,
        private readonly MCPAuthorizationStateStore $stateStore,
        private readonly MCPAuthorizationSecretCipher $secretCipher,
        private readonly ConfigInterface $config,
        LoggerFactory $loggerFactory
    ) {
        $this->logger = $loggerFactory->get('MCPAuthorizationAppService');
        $httpClient = new Client();
        $this->discoveryClient = new MCPAuthorizationDiscoveryClient($httpClient);
        $this->tokenClient = new MCPAuthorizationTokenClient($httpClient);
        $this->preflightService = new MCPAuthorizationPreflightService($httpClient, $this->discoveryClient);
    }

    /**
     * 获取新模式授权状态和授权 URL。
     *
     * @return array<string, mixed>
     */
    public function getAuthConfig(
        MCPDataIsolation $dataIsolation,
        MCPServerEntity $mcpServer,
        ?Authenticatable $authorization,
        string $redirectUrl
    ): array {
        $config = $this->getConfig($mcpServer);
        $resource = $config->getResource() ?: $this->getResource($mcpServer);
        $userId = $authorization?->getId() ?: $dataIsolation->getCurrentUserId();
        $credential = $this->credentialDomainService->getByResource($dataIsolation, $userId, $mcpServer->getCode(), $resource);

        if ($credential?->isAccessTokenValid((int) $this->config->get('mcp_authorization.token_expiry_leeway', 30))) {
            return [
                'is_authenticated' => true,
                'oauth_url' => '',
                'authorization_url' => '',
                'issuer' => $credential->getIssuer(),
                'resource' => $resource,
                'scope' => $credential->getScope(),
                'expires_at' => $credential->getExpiresAt()?->format('Y-m-d H:i:s'),
            ];
        }

        try {
            if ($credential && $credential->getRefreshTokenCiphertext() !== null) {
                try {
                    $refreshed = $this->refreshCredential($dataIsolation, $credential, $config);
                    if ($refreshed) {
                        return [
                            'is_authenticated' => true,
                            'oauth_url' => '',
                            'authorization_url' => '',
                            'issuer' => $refreshed->getIssuer(),
                            'resource' => $resource,
                            'scope' => $refreshed->getScope(),
                            'expires_at' => $refreshed->getExpiresAt()?->format('Y-m-d H:i:s'),
                        ];
                    }
                } catch (Throwable $throwable) {
                    $this->logger->warning('MCPAuthorizationTokenRefreshFailed', [
                        'mcp_server_code' => $mcpServer->getCode(),
                        'error' => $throwable->getMessage(),
                    ]);
                }
            }

            $redirectUri = $redirectUrl ?: $config->getRedirectUri();
            if ($redirectUri === '') {
                throw new RuntimeException('MCP authorization redirect URI is required');
            }
            $metadata = $this->resolveMetadata($resource, $config);
            $registration = $this->resolveClientRegistration($config, $metadata, $redirectUri);
            $clientId = $registration['client_id'];
            $state = bin2hex(random_bytes(32));
            $codeVerifier = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');

            $issuer = (string) ($metadata['issuer'] ?? '');
            $this->stateStore->put($state, [
                'user_id' => $userId,
                'organization_code' => $dataIsolation->getCurrentOrganizationCode(),
                'mcp_server_code' => $mcpServer->getCode(),
                'resource' => $resource,
                'issuer' => $issuer,
                'redirect_uri' => $redirectUri,
                'code_verifier' => $codeVerifier,
                'client_id' => $clientId,
                'client_secret_ciphertext' => $registration['client_secret'] !== '' ? $this->secretCipher->encrypt($registration['client_secret']) : null,
                'token_endpoint_auth_method' => $registration['token_endpoint_auth_method'],
                'registration_mode' => $this->resolveRegistrationMode($config),
                'metadata' => $metadata,
                'created_at' => time(),
            ]);

            $authorizationEndpoint = (string) ($metadata['authorization_server']['authorization_endpoint'] ?? $config->getAuthorizationEndpoint());
            if ($authorizationEndpoint === '') {
                throw new RuntimeException('MCP authorization endpoint is missing');
            }
            $query = array_merge($config->getAdditionalParams(), [
                'response_type' => 'code',
                'client_id' => $clientId,
                'redirect_uri' => $redirectUri,
                'state' => $state,
                'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $codeVerifier, true)), '+/', '-_'), '='),
                'code_challenge_method' => 'S256',
                'resource' => $resource,
            ]);
            if ($config->getScope() !== '') {
                $query['scope'] = $config->getScope();
            }
            $url = $authorizationEndpoint . (str_contains($authorizationEndpoint, '?') ? '&' : '?') . http_build_query($query);

            return [
                'is_authenticated' => false,
                'oauth_url' => $url,
                'authorization_url' => $url,
                'state' => $state,
                'expires_in' => (int) $this->config->get('mcp_authorization.state_ttl', 600),
                'issuer' => $issuer,
                'resource' => $resource,
            ];
        } catch (Throwable $throwable) {
            $this->logger->warning('MCPAuthorizationUrlGenerationFailed', [
                'mcp_server_code' => $mcpServer->getCode(),
                'error' => $throwable->getMessage(),
            ]);
            return [
                'is_authenticated' => false,
                'oauth_url' => '',
                'authorization_url' => '',
                'resource' => $resource,
                'error' => 'MCP authorization is not available',
            ];
        }
    }

    /**
     * 从 MCP Server 读取新模式配置。
     */
    public function getConfig(MCPServerEntity $mcpServer): MCPAuthorizationConfig
    {
        $serviceConfig = $mcpServer->getServiceConfig();
        if (! $serviceConfig instanceof ExternalSSEServiceConfig || ! $serviceConfig->getMcpAuthorizationConfig()) {
            ExceptionBuilder::throw(MCPErrorCode::MCPAuthorizationNotConfigured);
        }
        return $serviceConfig->getMcpAuthorizationConfig();
    }

    /**
     * 检查新增 MCP Server 是否具备进入 Authorization 流程的基础条件。
     */
    public function preflight(MCPServerEntity $mcpServer): void
    {
        $this->preflightService->check($mcpServer);
    }

    /**
     * 解析 protected resource 的规范资源地址。
     */
    public function getResource(MCPServerEntity $mcpServer): string
    {
        $serviceConfig = $mcpServer->getServiceConfig();
        return $serviceConfig instanceof ExternalSSEServiceConfig ? $serviceConfig->getUrl() : '';
    }

    /**
     * 为 Super Magic 任务解析新模式的运行时访问令牌。
     *
     * 返回值仅供当前请求构建 MCP HTTP header，不会写入配置或 API 响应。
     */
    public function getRuntimeAccessToken(MCPDataIsolation $dataIsolation, MCPServerEntity $mcpServer): ?string
    {
        $config = $this->getConfig($mcpServer);
        $resource = $config->getResource() ?: $this->getResource($mcpServer);
        $credential = $this->credentialDomainService->getByResource(
            $dataIsolation,
            $dataIsolation->getCurrentUserId(),
            $mcpServer->getCode(),
            $resource
        );
        if ($credential === null) {
            return null;
        }
        if (! $credential->isAccessTokenValid((int) $this->config->get('mcp_authorization.token_expiry_leeway', 30))) {
            if ($credential->getRefreshTokenCiphertext() === null) {
                return null;
            }
            try {
                $credential = $this->refreshCredential($dataIsolation, $credential, $config);
            } catch (Throwable $throwable) {
                $this->logger->warning('MCPAuthorizationRuntimeTokenRefreshFailed', [
                    'mcp_server_code' => $mcpServer->getCode(),
                    'error' => $throwable->getMessage(),
                ]);
                return null;
            }
            if ($credential === null || ! $credential->isAccessTokenValid((int) $this->config->get('mcp_authorization.token_expiry_leeway', 30))) {
                return null;
            }
        }
        return $this->secretCipher->decrypt($credential->getAccessTokenCiphertext()) ?: null;
    }

    /**
     * 将 Token 响应更新到凭据实体。
     *
     * @param array<string, mixed> $tokens
     */
    public function applyTokenSet(MCPAuthorizationCredentialEntity $credential, array $tokens): void
    {
        $credential->setAccessTokenCiphertext($this->secretCipher->encrypt((string) $tokens['access_token']));
        if (! empty($tokens['refresh_token'])) {
            $credential->setRefreshTokenCiphertext($this->secretCipher->encrypt((string) $tokens['refresh_token']));
        }
        $credential->setTokenType((string) ($tokens['token_type'] ?? 'Bearer'));
        $credential->setScope(isset($tokens['scope']) ? (string) $tokens['scope'] : $credential->getScope());
        $credential->setExpiresAt(isset($tokens['expires_in']) ? date('Y-m-d H:i:s', time() + (int) $tokens['expires_in']) : null);
        $credential->setRefreshTokenExpiresAt(isset($tokens['refresh_token_expires_in']) ? date('Y-m-d H:i:s', time() + (int) $tokens['refresh_token_expires_in']) : $credential->getRefreshTokenExpiresAt());
    }

    /**
     * 解析预注册、CIMD 或 DCR 客户端信息。
     *
     * @param array<string, mixed> $metadata
     * @return array{client_id: string, client_secret: string, token_endpoint_auth_method: string}
     */
    private function resolveClientRegistration(MCPAuthorizationConfig $config, array $metadata, string $redirectUri): array
    {
        $mode = $this->resolveRegistrationMode($config);
        if ($mode === 'cimd') {
            return [
                'client_id' => $config->getClientMetadataUrl(),
                'client_secret' => '',
                'token_endpoint_auth_method' => $config->getTokenEndpointAuthMethod() ?: 'none',
            ];
        }
        if ($mode === 'pre_registered') {
            if ($config->getClientId() === '') {
                throw new RuntimeException('MCP authorization client_id is missing');
            }
            return [
                'client_id' => $config->getClientId(),
                'client_secret' => $config->getClientSecret(),
                'token_endpoint_auth_method' => $config->getTokenEndpointAuthMethod() ?: (! empty($config->getClientSecret()) ? 'client_secret_basic' : 'none'),
            ];
        }

        $registrationEndpoint = (string) ($metadata['authorization_server']['registration_endpoint'] ?? $config->getRegistrationEndpoint());
        if ($registrationEndpoint === '') {
            throw new RuntimeException('MCP dynamic client registration endpoint is missing');
        }
        $tokenEndpointAuthMethod = $this->resolveTokenEndpointAuthMethod($config, $metadata);
        $registrationPayload = [
            'client_name' => 'Magic MCP Client',
            'redirect_uris' => [$redirectUri],
            'response_types' => ['code'],
            'grant_types' => ['authorization_code', 'refresh_token'],
            'token_endpoint_auth_method' => $tokenEndpointAuthMethod,
            'application_type' => $config->getApplicationType(),
        ];
        if ($config->getScope() !== '') {
            $registrationPayload['scope'] = $config->getScope();
        }
        $client = new Client();
        $response = $client->request('POST', $registrationEndpoint, [
            'headers' => ['Accept' => 'application/json', 'Content-Type' => 'application/json'],
            'json' => $registrationPayload,
            'timeout' => 15,
            'connect_timeout' => 5,
        ]);
        $registration = json_decode((string) $response->getBody(), true);
        if (! is_array($registration) || empty($registration['client_id'])) {
            throw new RuntimeException('MCP dynamic client registration response is invalid');
        }
        return [
            'client_id' => (string) $registration['client_id'],
            'client_secret' => (string) ($registration['client_secret'] ?? ''),
            'token_endpoint_auth_method' => (string) ($registration['token_endpoint_auth_method'] ?? $tokenEndpointAuthMethod),
        ];
    }

    /**
     * 根据显式配置和授权服务器元数据选择 Token 端点认证方式。
     *
     * @param array<string, mixed> $metadata
     */
    private function resolveTokenEndpointAuthMethod(MCPAuthorizationConfig $config, array $metadata): string
    {
        if ($config->getTokenEndpointAuthMethod() !== '') {
            return $config->getTokenEndpointAuthMethod();
        }
        $supported = $metadata['authorization_server']['token_endpoint_auth_methods_supported'] ?? [];
        if (is_array($supported)) {
            foreach ($supported as $method) {
                if (is_string($method) && in_array($method, ['none', 'client_secret_basic', 'client_secret_post'], true)) {
                    return $method;
                }
            }
        }
        return 'none';
    }

    private function resolveRegistrationMode(MCPAuthorizationConfig $config): string
    {
        $mode = $config->getRegistrationMode();
        if ($mode === 'auto') {
            $mode = $config->getClientId() !== '' ? 'pre_registered' : ($config->getClientMetadataUrl() !== '' ? 'cimd' : 'dcr');
        }
        if (! in_array($mode, ['pre_registered', 'cimd', 'dcr'], true)) {
            throw new RuntimeException('MCP dynamic client registration is not enabled');
        }
        return $mode;
    }

    /**
     * 读取或构造 discovery metadata。
     *
     * @return array<string, mixed>
     */
    private function resolveMetadata(string $resource, MCPAuthorizationConfig $config): array
    {
        if ($config->getAuthorizationEndpoint() !== '' && $config->getTokenEndpoint() !== '') {
            $issuer = $config->getAuthorizationServerUrl();
            return [
                'issuer' => $issuer,
                'resource_metadata' => ['authorization_servers' => [$issuer]],
                'authorization_server' => [
                    'issuer' => $issuer,
                    'authorization_endpoint' => $config->getAuthorizationEndpoint(),
                    'token_endpoint' => $config->getTokenEndpoint(),
                    'registration_endpoint' => $config->getRegistrationEndpoint(),
                    'token_endpoint_auth_methods_supported' => [$config->getTokenEndpointAuthMethod() ?: 'none'],
                ],
            ];
        }
        return $this->discoveryClient->discover(
            $resource,
            $config->getResourceMetadataUrl() ?: null,
            $config->getAuthorizationServerUrl() ?: null
        );
    }

    /**
     * 刷新已有新模式凭据。
     */
    private function refreshCredential(MCPDataIsolation $dataIsolation, MCPAuthorizationCredentialEntity $credential, MCPAuthorizationConfig $config): ?MCPAuthorizationCredentialEntity
    {
        $refreshToken = $this->secretCipher->decrypt($credential->getRefreshTokenCiphertext());
        if ($refreshToken === '') {
            return null;
        }
        $tokenEndpoint = (string) ($credential->getDiscoveryMetadata()['authorization_server']['token_endpoint'] ?? $config->getTokenEndpoint());
        if ($tokenEndpoint === '') {
            return null;
        }
        $config->setClientId($credential->getClientId());
        $config->setClientSecret($this->secretCipher->decrypt($credential->getClientSecretCiphertext()));
        $config->setTokenEndpointAuthMethod($credential->getTokenEndpointAuthMethod());
        $tokens = $this->tokenClient->refresh($tokenEndpoint, $config, $refreshToken, $credential->getResource());
        $this->applyTokenSet($credential, $tokens);
        return $this->credentialDomainService->save($dataIsolation, $credential);
    }
}
