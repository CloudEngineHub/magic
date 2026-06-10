<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\PointConsumption\Strategy;

use App\Domain\ImageGenerate\ValueObject\ImageGenerateSourceEnum;
use App\Domain\ModelGateway\Event\ImageOperationCompletedEvent;
use DateTime;
use Dtyq\BillingManager\Domain\PointConsumption\Service\PointConsumptionDomainService;
use Dtyq\BillingManager\Domain\PointConsumption\Service\SuperMagicBusinessResolver;
use Dtyq\BillingManager\Domain\PointConsumption\Strategy\ImageOperationConsumptionStrategy;
use Dtyq\BillingManager\Domain\Shared\ValueObject\ConsumeContext;
use Dtyq\BillingManager\Domain\Shared\ValueObject\ExtentAttributeVO;
use Dtyq\BillingManager\Infrastructure\Core\Constants\BillManager\BillingTargetType;
use Dtyq\BillingManager\Infrastructure\Core\Constants\BillManager\QuotaType;
use Dtyq\BillingManager\Infrastructure\Core\Constants\PointLog\PointLogChangeType;
use Dtyq\BillingManager\Infrastructure\Core\Constants\PointLog\ResourceType;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Logger\LoggerFactory;
use Hyperf\Snowflake\IdGeneratorInterface;
use Hyperf\Snowflake\Meta;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Log\NullLogger;
use RuntimeException;

/**
 * @internal
 */
final class ImageOperationConsumptionStrategyTest extends TestCase
{
    protected function setUp(): void
    {
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn(new NullLogger());
        $idGenerator = new class implements IdGeneratorInterface {
            public function generate(?Meta $meta = null): int
            {
                return 1000000000000000001;
            }

            public function degenerate(int $id): Meta
            {
                return new Meta(1, 1, 1, 1);
            }
        };

        ApplicationContext::setContainer(new class($loggerFactory, $idGenerator) implements ContainerInterface {
            public function __construct(
                private readonly LoggerFactory $loggerFactory,
                private readonly IdGeneratorInterface $idGenerator,
            ) {
            }

            public function get(string $id): mixed
            {
                return match ($id) {
                    LoggerFactory::class => $this->loggerFactory,
                    IdGeneratorInterface::class => $this->idGenerator,
                    default => throw new RuntimeException('Unsupported service: ' . $id),
                };
            }

            public function has(string $id): bool
            {
                return in_array($id, [LoggerFactory::class, IdGeneratorInterface::class], true);
            }
        });
    }

    public function testEraserOperationCostsTwentyTwoPoints(): void
    {
        $consumption = $this->createStrategy()->createConsumption(
            $this->createConsumeContext(),
            $this->createEvent(ImageOperationCompletedEvent::OPERATION_ERASER)
        );

        $this->assertSame(22, $consumption->getTotalPoints());
        $this->assertSame(22, $consumption->getPriceInfo()?->getActualAmount());
        $this->assertSame(20, $consumption->getPriceInfo()?->getCostAmount());
        $this->assertSame(ResourceType::IMAGE_OPERATION->value, $consumption->getExtentAttribute()->getResourceType());
        $this->assertSame(ImageOperationCompletedEvent::OPERATION_ERASER, $consumption->getExtentAttribute()->getResourceId());
        $this->assertSame('event-001', $consumption->getEventId());
    }

    public function testExpandOperationCostsTwentyTwoPoints(): void
    {
        $consumption = $this->createStrategy()->createConsumption(
            $this->createConsumeContext(),
            $this->createEvent(ImageOperationCompletedEvent::OPERATION_EXPAND)
        );

        $this->assertSame(22, $consumption->getTotalPoints());
        $this->assertSame(22, $consumption->getPriceInfo()?->getActualAmount());
        $this->assertSame(20, $consumption->getPriceInfo()?->getCostAmount());
        $this->assertSame(ImageOperationCompletedEvent::OPERATION_EXPAND, $consumption->getExtentAttribute()->getResourceId());
    }

    public function testUnconfiguredOperationCannotCreateConsumption(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Image operation pricing is not configured');

        $this->createStrategy()->createConsumption(
            $this->createConsumeContext(),
            $this->createEvent(ImageOperationCompletedEvent::OPERATION_REMOVE_BACKGROUND)
        );
    }

    private function createStrategy(): ImageOperationConsumptionStrategy
    {
        $domainService = $this->createMock(PointConsumptionDomainService::class);
        $domainService->method('createExtentAttribute')
            ->willReturnCallback(
                static function (
                    string $organizationCode,
                    string $userId,
                    PointLogChangeType $pointLogChangeType,
                    ?string $topicId,
                    ?string $taskId,
                    ?string $resourceId,
                    ?string $resourceType,
                    ?string $nominalResourceId,
                ): ExtentAttributeVO {
                    return ExtentAttributeVO::createForMagicModelConsume(
                        $organizationCode,
                        $userId,
                        $pointLogChangeType,
                        resourceId: $resourceId,
                        resourceType: $resourceType,
                        nominalResourceId: $nominalResourceId
                    );
                }
            );

        return new ImageOperationConsumptionStrategy(
            $domainService,
            $this->createMock(SuperMagicBusinessResolver::class),
            $this->createConfig()
        );
    }

    private function createEvent(string $operationType): ImageOperationCompletedEvent
    {
        $event = new ImageOperationCompletedEvent();
        $event->setOrganizationCode('ORG001');
        $event->setUserId('10001');
        $event->setOperationType($operationType);
        $event->setProvider('volcengine');
        $event->setImageCount(1);
        $event->setOriginalModelId('doubao-image');
        $event->setCallTime('2026-06-10 12:00:00');
        $event->setResponseTime(1000);
        $event->setSourceId('image_operation_test');
        $event->setSourceType(ImageGenerateSourceEnum::API);
        $event->setCreatedAt(new DateTime('2026-06-10 12:00:00'));
        $event->setBusinessParams(['event_id' => 'event-001']);

        return $event;
    }

    private function createConsumeContext(): ConsumeContext
    {
        return new ConsumeContext(
            'ORG001',
            BillingTargetType::ORGANIZATION->value,
            'ORG001',
            BillingTargetType::ORGANIZATION->value,
            QuotaType::ORGANIZATION_MAGIC_POINT->value,
            'personal_free'
        );
    }

    private function createConfig(): ConfigInterface
    {
        return new class implements ConfigInterface {
            private array $data = [
                'billing' => [
                    'point_per_CNY' => '100',
                    'default_image_operation_currency' => 'CNY',
                    'image_operation_pricing' => [
                        ImageOperationCompletedEvent::OPERATION_ERASER => [
                            'price' => '0.22',
                            'cost_price' => '0.20',
                            'currency' => 'CNY',
                        ],
                        ImageOperationCompletedEvent::OPERATION_EXPAND => [
                            'price' => '0.22',
                            'cost_price' => '0.20',
                            'currency' => 'CNY',
                        ],
                    ],
                ],
            ];

            public function get(string $key, mixed $default = null): mixed
            {
                $value = $this->data;
                foreach (explode('.', $key) as $segment) {
                    if (! is_array($value) || ! array_key_exists($segment, $value)) {
                        return $default;
                    }
                    $value = $value[$segment];
                }

                return $value;
            }

            public function has(string $keys): bool
            {
                return $this->get($keys) !== null;
            }

            public function set(string $key, mixed $value): void
            {
                $segments = explode('.', $key);
                $cursor = &$this->data;
                foreach ($segments as $segment) {
                    if (! isset($cursor[$segment]) || ! is_array($cursor[$segment])) {
                        $cursor[$segment] = [];
                    }
                    $cursor = &$cursor[$segment];
                }
                $cursor = $value;
            }
        };
    }
}
