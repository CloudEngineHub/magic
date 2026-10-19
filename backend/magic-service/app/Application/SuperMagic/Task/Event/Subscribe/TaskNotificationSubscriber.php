<?php

declare(strict_types=1);

namespace App\Application\SuperMagic\Task\Event\Subscribe;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Contract\EventRecipient;
use App\Application\Notification\Contract\EventSource;
use App\Application\Notification\Contract\NotificationEventPublisherInterface;
use App\Domain\SuperMagic\Project\Service\ProjectDomainService;
use App\Domain\SuperMagic\Task\Entity\ValueObject\TaskStatus;
use App\Domain\SuperMagic\Task\Event\RunTaskCallbackEvent;
use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use App\Domain\SuperMagic\Workspace\Service\WorkspaceDomainService;
use Dtyq\AsyncEvent\Kernel\Annotation\AsyncListener;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Container\ContainerInterface;
use Psr\Log\LoggerInterface;
use Throwable;

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
        $labels = $this->resolveLabels($event);
        $payload = [
            'task_id' => $taskId,
            'topic_id' => (string) $event->getTopicId(),
            'task_name' => $event->getTopicName() !== '' ? $event->getTopicName() : $labels['topic_name'],
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

    /** @return array{topic_name:string,workspace_id:string,workspace_name:string,project_id:string,project_name:string} */
    private function resolveLabels(RunTaskCallbackEvent $event): array
    {
        $labels = [
            'topic_name' => '',
            'workspace_id' => '',
            'workspace_name' => '',
            'project_id' => '',
            'project_name' => '',
        ];

        try {
            $topic = di(TopicDomainService::class)->getTopicById($event->getTopicId());
            if ($topic === null) {
                return $labels;
            }
            $labels['topic_name'] = $topic->getTopicName();
            $labels['project_id'] = (string) $topic->getProjectId();
            $labels['workspace_id'] = (string) ($topic->getWorkspaceId() ?? '');

            $project = di(ProjectDomainService::class)->getProjectNotUserId($topic->getProjectId());
            $labels['project_name'] = $project?->getProjectName() ?? '';
            $workspace = di(WorkspaceDomainService::class)->getWorkspaceDetail($topic->getWorkspaceId());
            $labels['workspace_name'] = $workspace?->getName() ?? '';
        } catch (Throwable $throwable) {
            $this->logger->warning('Resolve task notification labels failed', [
                'topic_id' => $event->getTopicId(),
                'task_id' => $event->getTaskId(),
                'error' => $throwable->getMessage(),
            ]);
        }

        return $labels;
    }
}
