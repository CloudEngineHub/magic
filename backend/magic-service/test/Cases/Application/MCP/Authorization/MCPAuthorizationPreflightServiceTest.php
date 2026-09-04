<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Application\MCP\Authorization;

use App\Application\MCP\Authorization\Discovery\MCPAuthorizationDiscoveryClient;
use App\Application\MCP\Authorization\MCPAuthorizationPreflightService;
use App\Domain\MCP\Constant\ServiceConfigAuthType;
use App\Domain\MCP\Entity\MCPServerEntity;
use App\Domain\MCP\Entity\ValueObject\Authorization\MCPAuthorizationConfig;
use App\Domain\MCP\Entity\ValueObject\ServiceConfig\ExternalSSEServiceConfig;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;
use Throwable;

/**
 * @internal
 */
class MCPAuthorizationPreflightServiceTest extends TestCase
{
    public function testAcceptsUnauthenticatedButReachableMcpResource(): void
    {
        $mock = new MockHandler([
            new Response(401, ['WWW-Authenticate' => 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"']),
        ]);
        $client = new Client(['handler' => HandlerStack::create($mock)]);
        $service = new MCPAuthorizationPreflightService($client, new MCPAuthorizationDiscoveryClient($client));

        $service->check($this->createMcpServer());

        $this->assertSame(0, $mock->count());
    }

    public function testRejectsUnavailableMcpResource(): void
    {
        $mock = new MockHandler([
            new Response(404),
        ]);
        $client = new Client(['handler' => HandlerStack::create($mock)]);
        $service = new MCPAuthorizationPreflightService($client, new MCPAuthorizationDiscoveryClient($client));

        $this->expectException(Throwable::class);
        $service->check($this->createMcpServer());
    }

    private function createMcpServer(): MCPServerEntity
    {
        $authorizationConfig = new MCPAuthorizationConfig();
        $authorizationConfig->setAuthorizationEndpoint('https://auth.example.com/authorize');
        $authorizationConfig->setTokenEndpoint('https://auth.example.com/token');
        $authorizationConfig->setRegistrationMode('pre_registered');
        $authorizationConfig->setClientId('mock-client-id');

        $serviceConfig = new ExternalSSEServiceConfig();
        $serviceConfig->setUrl('https://mcp.example.com/mcp');
        $serviceConfig->setAuthType(ServiceConfigAuthType::MCP_AUTHORIZATION);
        $serviceConfig->setMcpAuthorizationConfig($authorizationConfig);

        $server = new MCPServerEntity();
        $server->setServiceConfig($serviceConfig);
        return $server;
    }
}
