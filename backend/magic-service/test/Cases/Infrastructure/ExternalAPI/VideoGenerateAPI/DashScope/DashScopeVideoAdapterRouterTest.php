<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope;

use App\Domain\ModelGateway\Entity\ValueObject\VideoOperationStatus;
use App\Domain\ModelGateway\Entity\VideoQueueOperationEntity;
use App\Domain\Provider\Entity\ValueObject\ProviderCode;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\Adapter\DashScopeVideoAdapterRouter;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\Adapter\Wan27VideoAdapter;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\Adapter\Wan30VideoAdapter;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\Capability\Wan30GenerationCapabilityProvider;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\DashScopeTransportInterface;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\VideoGenerateProviderType;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\TranslatorInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use RuntimeException;

/**
 * @internal
 */
class DashScopeVideoAdapterRouterTest extends TestCase
{
    protected function setUp(): void
    {
        ApplicationContext::setContainer(new readonly class implements ContainerInterface {
            public function get(string $id): mixed
            {
                return $id === TranslatorInterface::class ? new class implements TranslatorInterface {
                    public function trans(string $key, array $replace = [], ?string $locale = null): string
                    {
                        return $key;
                    }

                    public function transChoice(string $key, $number, array $replace = [], ?string $locale = null): string
                    {
                        return $key;
                    }

                    public function getLocale(): string
                    {
                        return 'zh_CN';
                    }

                    public function setLocale(string $locale)
                    {
                        return $this;
                    }
                } : null;
            }

            public function has(string $id): bool
            {
                return $id === TranslatorInterface::class;
            }
        });
    }

    public function testProviderTypeMapsDashScopeProviderCode(): void
    {
        $this->assertSame(
            VideoGenerateProviderType::DashScope,
            VideoGenerateProviderType::fromProviderCode(ProviderCode::DashScope)
        );
    }

    public function testSupportsModelDelegatesToWan27Adapter(): void
    {
        $wan27VideoAdapter = $this->createMock(Wan27VideoAdapter::class);
        $wan27VideoAdapter->method('supportsModel')->willReturn(true);
        $wan27VideoAdapter->expects($this->once())
            ->method('supportsModel')
            ->with('wan2.7-t2v', 'wan2.7')
            ->willReturn(true);

        $router = new DashScopeVideoAdapterRouter($wan27VideoAdapter, $this->wan30Adapter());

        $this->assertTrue($router->supportsModel('wan2.7-t2v', 'wan2.7'));
    }

    public function testBuildProviderPayloadDelegatesToWan27Adapter(): void
    {
        $operation = $this->createOperation();
        $expectedPayload = [
            'model' => 'wan2.7',
            'input' => [
                'prompt' => '生成一段视频',
            ],
        ];

        $wan27VideoAdapter = $this->createMock(Wan27VideoAdapter::class);
        $wan27VideoAdapter->method('supportsModel')->willReturn(true);
        $wan27VideoAdapter->expects($this->once())
            ->method('buildProviderPayload')
            ->with($operation)
            ->willReturn($expectedPayload);

        $router = new DashScopeVideoAdapterRouter($wan27VideoAdapter, $this->wan30Adapter());

        $this->assertSame($expectedPayload, $router->buildProviderPayload($operation));
    }

    public function testBuildProviderPayloadDispatchesWan30Adapter(): void
    {
        $wan27VideoAdapter = $this->createMock(Wan27VideoAdapter::class);
        $wan27VideoAdapter->expects($this->never())->method('buildProviderPayload');
        $router = new DashScopeVideoAdapterRouter($wan27VideoAdapter, $this->wan30Adapter());

        $operation = $this->createWan30Operation();
        $payload = $router->buildProviderPayload($operation);

        $this->assertSame('wan3.0-video', $payload['model']);
    }

    public function testUnknownModelThrowsRuntimeExceptionWhenRoutingOperation(): void
    {
        $router = new DashScopeVideoAdapterRouter(
            $this->createMock(Wan27VideoAdapter::class),
            $this->wan30Adapter(),
        );

        $operation = $this->createOperation(model: 'unknown-model', modelVersion: 'unknown-model');

        $this->expectException(RuntimeException::class);
        $router->buildProviderPayload($operation);
    }

    private function wan30Adapter(): Wan30VideoAdapter
    {
        return new Wan30VideoAdapter(
            new Wan30GenerationCapabilityProvider(),
            $this->createMock(DashScopeTransportInterface::class),
        );
    }

    private function createWan30Operation(): VideoQueueOperationEntity
    {
        return new VideoQueueOperationEntity(
            id: 'op-dashscope-router-wan30',
            endpoint: 'video:wan3.0',
            model: 'wan3.0-video',
            modelVersion: 'wan3.0-video',
            providerModelId: 'provider-model',
            providerCode: 'DashScope',
            providerName: 'dashscope',
            organizationCode: 'org-1',
            userId: 'user-1',
            status: VideoOperationStatus::QUEUED,
            seq: 1,
            rawRequest: ['prompt' => '生成一段视频'],
            createdAt: date(DATE_ATOM),
            heartbeatAt: date(DATE_ATOM),
        );
    }

    private function createOperation(string $model = 'wan2.7', string $modelVersion = 'wan2.7-t2v'): VideoQueueOperationEntity
    {
        return new VideoQueueOperationEntity(
            id: 'op-dashscope-router-1',
            endpoint: 'video:wan2.7',
            model: $model,
            modelVersion: $modelVersion,
            providerModelId: 'provider-model',
            providerCode: 'DashScope',
            providerName: 'dashscope',
            organizationCode: 'org-1',
            userId: 'user-1',
            status: VideoOperationStatus::QUEUED,
            seq: 1,
            rawRequest: ['prompt' => '生成一段视频'],
            createdAt: date(DATE_ATOM),
            heartbeatAt: date(DATE_ATOM),
        );
    }
}
