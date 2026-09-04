<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MCP\Authorization;

use App\Application\MCP\Authorization\Discovery\MCPAuthorizationDiscoveryClient;
use App\Domain\MCP\Constant\ServiceConfigAuthType;
use App\Domain\MCP\Entity\MCPServerEntity;
use App\Domain\MCP\Entity\ValueObject\Authorization\MCPAuthorizationConfig;
use App\Domain\MCP\Entity\ValueObject\ServiceConfig\ExternalSSEServiceConfig;
use App\ErrorCode\MCPErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\RequestOptions;
use GuzzleHttp\ClientInterface;
use RuntimeException;
use Throwable;

/**
 * MCP 2026-07-28 Authorization 新增服务轻量预检服务。
 *
 * 预检只确认 MCP 地址可访问，以及授权发现信息基本完整；不执行用户授权、DCR、Token 交换或工具调用。
 */
class MCPAuthorizationPreflightService
{
    public function __construct(
        private readonly ClientInterface $httpClient,
        private readonly MCPAuthorizationDiscoveryClient $discoveryClient
    ) {
    }

    /**
     * 检查 MCP Server 是否具备进入 Authorization 流程的基础条件。
     *
     * @throws Throwable
     */
    public function check(MCPServerEntity $mcpServer): void
    {
        $serviceConfig = $mcpServer->getServiceConfig();
        if (! $serviceConfig instanceof ExternalSSEServiceConfig || $serviceConfig->getAuthType() !== ServiceConfigAuthType::MCP_AUTHORIZATION) {
            return;
        }

        $authorizationConfig = $serviceConfig->getMcpAuthorizationConfig();
        if ($authorizationConfig === null) {
            ExceptionBuilder::throw(MCPErrorCode::MCPAuthorizationNotConfigured);
        }

        try {
            // 在保存前重复执行配置校验，确保预检使用的是可解析的完整配置。
            $serviceConfig->validate();

            $resource = $authorizationConfig->getResource() ?: $serviceConfig->getUrl();
            if ($resource === '' || str_contains($resource, '${')) {
                throw new RuntimeException('MCP authorization resource must be a concrete URL');
            }

            $this->probeResource($resource, $serviceConfig->getHeadersArray());

            $metadata = $this->resolveMetadata($resource, $authorizationConfig);
            $authorizationServer = $metadata['authorization_server'] ?? null;
            if (! is_array($authorizationServer)) {
                throw new RuntimeException('MCP authorization server metadata is invalid');
            }
            foreach (['authorization_endpoint', 'token_endpoint'] as $requiredField) {
                if (empty($authorizationServer[$requiredField]) || ! is_string($authorizationServer[$requiredField])) {
                    throw new RuntimeException('MCP authorization server metadata is incomplete');
                }
            }
        } catch (Throwable $throwable) {
            ExceptionBuilder::throw(MCPErrorCode::MCPAuthorizationDiscoveryFailed);
        }
    }

    /**
     * 对 MCP Resource 发起不带用户令牌的安全探测。
     *
     * 401、403、405 等状态表示服务端已响应，不能直接判定为不可用；404、重定向和 5xx 则视为地址或服务异常。
     *
     * @param array<string, string> $headers
     */
    private function probeResource(string $resource, array $headers): void
    {
        try {
            $response = $this->httpClient->request('GET', $resource, [
                RequestOptions::HEADERS => array_merge($headers, [
                    'Accept' => 'application/json, text/event-stream',
                ]),
                RequestOptions::HTTP_ERRORS => false,
                RequestOptions::ALLOW_REDIRECTS => false,
                RequestOptions::STREAM => true,
                RequestOptions::TIMEOUT => 10,
                RequestOptions::CONNECT_TIMEOUT => 5,
            ]);
        } catch (GuzzleException $exception) {
            throw new RuntimeException('MCP resource is unreachable', 0, $exception);
        }

        $statusCode = $response->getStatusCode();
        $response->getBody()->close();
        if ($statusCode === 404 || $statusCode >= 500 || ($statusCode >= 300 && $statusCode < 400)) {
            throw new RuntimeException('MCP resource returned an unavailable status');
        }
    }

    /**
     * 使用显式端点或标准 Discovery 获取授权服务器元数据。
     *
     * @return array<string, mixed>
     */
    private function resolveMetadata(string $resource, MCPAuthorizationConfig $authorizationConfig): array
    {
        if ($authorizationConfig->getAuthorizationEndpoint() !== '' && $authorizationConfig->getTokenEndpoint() !== '') {
            return [
                'authorization_server' => [
                    'authorization_endpoint' => $authorizationConfig->getAuthorizationEndpoint(),
                    'token_endpoint' => $authorizationConfig->getTokenEndpoint(),
                    'issuer' => $authorizationConfig->getAuthorizationServerUrl(),
                ],
            ];
        }

        return $this->discoveryClient->discover(
            $resource,
            $authorizationConfig->getResourceMetadataUrl() ?: null,
            $authorizationConfig->getAuthorizationServerUrl() ?: null
        );
    }
}
