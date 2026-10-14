<?php

declare(strict_types=1);

namespace App\Application\SuperMagic\Task\Event\Subscribe;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Contract\EventRecipient;
use App\Application\Notification\Contract\EventSource;
use App\Application\Notification\Contract\NotificationEventPublisherInterface;
use App\Application\SuperMagic\Task\Service\TaskNotificationLabelResolver;
use App\Domain\SuperMagic\Task\Entity\ValueObject\TaskStatus;
use App\Domain\SuperMagic\Task\Event\RunTaskCallbackEvent;
use Dtyq\AsyncEvent\Kernel\Annotation\AsyncListener;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Container\ContainerInterface;
use Psr\Log\LoggerInterface;

/** 将任务终态回调转换成统一站内信事件。 */
#[AsyncListener]
#[Listener]
final class TaskNotificationSubscriber implements ListenerInterface
{
    private LoggerInterface $logger;

    public function __construct(
        private readonly ContainerInterface $container,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get(static::class);
    }

    public function listen(): array
    {
        return [RunTaskCallbackEvent::class];
    }

    public function process(object $event): void
    {
        if (! $event instanceof RunTaskCallbackEvent) {
            return;
        }

        $status = TaskStatus::tryFrom($event->getTaskMessage()->getPayload()->getStatus());
        if ($status === null || ! $status->isFinal()) {
            return;
        }

        $organizationCode = trim($event->getOrganizationCode());
        $recipientUserId = trim($event->getUserId());
        $taskId = (string) $event->getTaskId();
        if ($organizationCode === '' || $recipientUserId === '') {
            $this->logger->warning('Skip task notification event with incomplete context', [
                'event_id' => (string) $event->getEventId(),
                'task_id' => $taskId,
                'organization_code' => $organizationCode,
                'user_id' => $recipientUserId,
            ]);
            return;
        }

        $eventType = $status === TaskStatus::FINISHED ? 'task.finished' : 'task.error';
        $statusSuffix = $status === TaskStatus::FINISHED ? 'finished' : 'error';
        $sourceEventKey = sprintf(
            'task:%s:%s:%s:%s',
            $organizationCode,
            $taskId,
            $recipientUserId,
            $statusSuffix
        );
        $labels = $this->container->get(TaskNotificationLabelResolver::class)->resolve(event: $event);
        $payload = [
            'task_id' => $taskId,
            'topic_id' => (string) $event->getTopicId(),
            'task_name' => $labels['topic_name'],
            'workspace_id' => $labels['workspace_id'],
            'workspace_name' => $labels['workspace_name'],
            'project_id' => $labels['project_id'],
            'project_name' => $labels['project_name'],
            'status' => $status->value,
            'error_message' => $status === TaskStatus::FINISHED
                ? null
                : $event->getTaskMessage()->getPayload()->getRemark(),
        ];

        $this->container->get(NotificationEventPublisherInterface::class)->publish(new EventEnvelope(
            eventId: (string) $event->getEventId(),
            eventType: $eventType,
            occurredAt: date('Y-m-d H:i:s'),
            producer: 'super_magic.task',
            organizationCode: $organizationCode,
            source: new EventSource('task', 'task', $taskId),
            recipients: [new EventRecipient($recipientUserId, $sourceEventKey, $payload)],
            payload: $payload,
        ));

        $this->logger->info('Task notification event published', [
            'event_id' => (string) $event->getEventId(),
            'event_type' => $eventType,
            'task_id' => $taskId,
            'organization_code' => $organizationCode,
            'recipient_user_id' => $recipientUserId,
        ]);
    }

}
