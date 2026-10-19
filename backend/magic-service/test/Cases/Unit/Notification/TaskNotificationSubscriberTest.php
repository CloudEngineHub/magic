<?php

declare(strict_types=1);

namespace HyperfTest\Cases\Unit\Notification;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Contract\NotificationEventPublisherInterface;
use App\Application\Notification\Strategy\DefaultNotificationCatalogStrategy;
use App\Application\Notification\Validator\NotificationEventEnvelopeValidator;
use App\Application\SuperMagic\Task\Event\Subscribe\TaskNotificationSubscriber;
use App\Domain\Notification\Service\NotificationEventTypeRegistry;
use App\Domain\SuperMagic\Message\Entity\ValueObject\MessagePayload;
use App\Domain\SuperMagic\Task\Event\RunTaskCallbackEvent;
use App\Interfaces\SuperMagic\Message\DTO\TopicTaskMessageDTO;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Log\LoggerInterface;

/** @internal */
final class TaskNotificationSubscriberTest extends TestCase
{
    public function testFinishedTaskIsConvertedToNotificationEnvelope(): void
    {
        $published = [];
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::once())
            ->method('publish')
            ->willReturnCallback(function (EventEnvelope|array $envelope) use (&$published): array {
                self::assertInstanceOf(EventEnvelope::class, $envelope);
                $published[] = $envelope;
                (new NotificationEventEnvelopeValidator(
                    new NotificationEventTypeRegistry(new DefaultNotificationCatalogStrategy())
                ))->validate($envelope);
                return ['event_id' => '1', 'status' => 'pending', 'accepted' => true, 'duplicate' => false];
            });

        [$subscriber, $event] = $this->subscriberAndEvent('finished', $publisher);
        $subscriber->process($event);

        self::assertCount(1, $published);
        self::assertSame('task.finished', $published[0]->eventType);
        self::assertSame('ORG', $published[0]->organizationCode);
        self::assertSame('456', $published[0]->source->id);
        self::assertSame('task:ORG:456:789:finished', $published[0]->recipients[0]->sourceEventKey);
        self::assertSame('finished', $published[0]->payload['status']);
    }

    /** @dataProvider errorStatuses */
    public function testErrorTerminalStatusesUseTaskErrorNotification(string $status): void
    {
        $published = [];
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::once())
            ->method('publish')
            ->willReturnCallback(function (EventEnvelope|array $envelope) use (&$published): array {
                self::assertInstanceOf(EventEnvelope::class, $envelope);
                $published[] = $envelope;
                return ['event_id' => '1', 'status' => 'pending', 'accepted' => true, 'duplicate' => false];
            });

        [$subscriber, $event] = $this->subscriberAndEvent($status, $publisher, 'task failed');
        $subscriber->process($event);

        self::assertCount(1, $published);
        self::assertSame('task.error', $published[0]->eventType);
        self::assertSame('task:ORG:456:789:error', $published[0]->recipients[0]->sourceEventKey);
        self::assertSame($status, $published[0]->payload['status']);
        self::assertSame('task failed', $published[0]->payload['error_message']);
    }

    public static function errorStatuses(): iterable
    {
        yield 'error' => ['error'];
        yield 'stopped' => ['stopped'];
        yield 'suspended' => ['suspended'];
    }

    public function testNonTerminalTaskStatusDoesNotPublish(): void
    {
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::never())->method('publish');

        [$subscriber, $event] = $this->subscriberAndEvent('running', $publisher, '', false);
        $subscriber->process($event);
    }

    public function testRepeatedCallbackKeepsStableIdempotencyIdentity(): void
    {
        $published = [];
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::exactly(2))
            ->method('publish')
            ->willReturnCallback(function (EventEnvelope|array $envelope) use (&$published): array {
                self::assertInstanceOf(EventEnvelope::class, $envelope);
                $published[] = $envelope;
                return [
                    'event_id' => (string) $envelope->eventId,
                    'status' => 'pending',
                    'accepted' => true,
                    'duplicate' => count($published) === 2,
                ];
            });

        [$subscriber, $event] = $this->subscriberAndEvent('finished', $publisher);
        $subscriber->process($event);
        $subscriber->process($event);

        self::assertCount(2, $published);
        self::assertSame($published[0]->eventId, $published[1]->eventId);
        self::assertSame(
            $published[0]->recipients[0]->sourceEventKey,
            $published[1]->recipients[0]->sourceEventKey
        );
        self::assertSame($published[0]->payload, $published[1]->payload);
    }

    /**
     * @return array{0:TaskNotificationSubscriber,1:RunTaskCallbackEvent}
     */
    private function subscriberAndEvent(
        string $status,
        NotificationEventPublisherInterface $publisher,
        string $remark = '',
        bool $expectPublisher = true,
    ): array {
        $logger = $this->createMock(LoggerInterface::class);
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn($logger);

        $payload = $this->createMock(MessagePayload::class);
        $payload->method('getStatus')->willReturn($status);
        $payload->method('getRemark')->willReturn($remark);
        $taskMessage = $this->createMock(TopicTaskMessageDTO::class);
        $taskMessage->method('getPayload')->willReturn($payload);
        $event = $this->createMock(RunTaskCallbackEvent::class);
        $event->method('getEventId')->willReturn(111);
        $event->method('getOrganizationCode')->willReturn('ORG');
        $event->method('getUserId')->willReturn('789');
        $event->method('getTopicId')->willReturn(123);
        $event->method('getTopicName')->willReturn('Weekly report');
        $event->method('getTaskId')->willReturn(456);
        $event->method('getTaskMessage')->willReturn($taskMessage);

        $container = $this->createMock(ContainerInterface::class);
        if ($expectPublisher) {
            $container->method('get')
                ->with(NotificationEventPublisherInterface::class)
                ->willReturn($publisher);
        } else {
            $container->expects(self::never())->method('get');
        }

        return [new TaskNotificationSubscriber($container, $loggerFactory), $event];
    }
}
