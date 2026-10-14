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
        $topicName = trim($event->getTopicName());
        $payload = [
            'task_id' => $taskId,
            'topic_id' => (string) $event->getTopicId(),
            'task_name' => $topicName !== '' ? $topicName : $labels['topic_name'],
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
        $topicName = trim($event->getTopicName());
        $labels = [
            'topic_name' => $topicName,
            'workspace_id' => trim($event->getWorkspaceId()),
            'workspace_name' => trim($event->getWorkspaceName()),
            'project_id' => trim($event->getProjectId()),
            'project_name' => trim($event->getProjectName()),
        ];

        // The callback is delivered asynchronously, so do not depend on the
        // request-scoped `di()` helper. Resolve each label independently: a
        // missing project must not discard the topic/workspace information that
        // was already loaded successfully.
        try {
            $topic = $this->container->get(TopicDomainService::class)->getTopicById($event->getTopicId());
            if ($topic !== null) {
                if ($topicName === '') {
                    $labels['topic_name'] = trim($topic->getTopicName());
                }
                if ((int) $labels['project_id'] <= 0) {
                    $labels['project_id'] = (string) $topic->getProjectId();
                }
                if ((int) $labels['workspace_id'] <= 0 && ($topic->getWorkspaceId() ?? 0) > 0) {
                    $labels['workspace_id'] = (string) $topic->getWorkspaceId();
                }
            }
        } catch (Throwable $throwable) {
            $this->logLabelResolutionFailure($event, 'topic', $throwable);
        }

        // Message metadata survives event serialization and contains the same
        // IDs even when the topic row has been archived between dispatch and
        // consumption.
        try {
            $metadata = $event->getTaskMessage()->getMetadata();
            if ((int) $labels['project_id'] <= 0) {
                $labels['project_id'] = trim($metadata->getProjectId());
            }
            if ((int) $labels['workspace_id'] <= 0) {
                $labels['workspace_id'] = trim($metadata->getWorkspaceId());
            }
        } catch (Throwable $throwable) {
            $this->logLabelResolutionFailure($event, 'metadata', $throwable);
        }

        if ($labels['project_id'] !== '' && (int) $labels['project_id'] > 0) {
            try {
                $project = $this->container->get(ProjectDomainService::class)
                    ->getProjectNotUserId((int) $labels['project_id']);
                if ($labels['project_name'] === '') {
                    $labels['project_name'] = trim($project?->getProjectName() ?? '');
                }
                if ((int) $labels['workspace_id'] <= 0 && ($project?->getWorkspaceId() ?? 0) > 0) {
                    $labels['workspace_id'] = (string) $project->getWorkspaceId();
                }
            } catch (Throwable $throwable) {
                $this->logLabelResolutionFailure($event, 'project', $throwable);
            }
        }

        if ($labels['workspace_id'] !== '' && (int) $labels['workspace_id'] > 0) {
            try {
                $workspace = $this->container->get(WorkspaceDomainService::class)
                    ->getWorkspaceDetail((int) $labels['workspace_id']);
                if ($labels['workspace_name'] === '') {
                    $labels['workspace_name'] = trim($workspace?->getName() ?? '');
                }
            } catch (Throwable $throwable) {
                $this->logLabelResolutionFailure($event, 'workspace', $throwable);
            }
        }

        return $labels;
    }

    private function logLabelResolutionFailure(RunTaskCallbackEvent $event, string $label, Throwable $throwable): void
    {
        $this->logger->warning('Resolve task notification label failed', [
            'label' => $label,
            'topic_id' => $event->getTopicId(),
            'task_id' => $event->getTaskId(),
            'error' => $throwable->getMessage(),
        ]);
    }
}
