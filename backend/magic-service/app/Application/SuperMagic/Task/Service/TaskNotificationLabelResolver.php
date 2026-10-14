<?php

declare(strict_types=1);

namespace App\Application\SuperMagic\Task\Service;

use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\Domain\SuperMagic\Project\Service\ProjectDomainService;
use App\Domain\SuperMagic\Task\Entity\TaskEntity;
use App\Domain\SuperMagic\Task\Event\RunTaskCallbackEvent;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;
use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use App\Domain\SuperMagic\Workspace\Service\WorkspaceDomainService;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Resolve the stable labels used by task notification payloads.
 *
 * Event snapshots are authoritative when present. Runtime entities and domain
 * queries only fill missing values, so early task failures and asynchronous
 * consumption follow the same fallback rules.
 */
final class TaskNotificationLabelResolver
{
    private LoggerInterface $logger;

    public function __construct(
        private readonly TopicDomainService $topicDomainService,
        private readonly ProjectDomainService $projectDomainService,
        private readonly WorkspaceDomainService $workspaceDomainService,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get(static::class);
    }

    /**
     * @return array{
     *     topic_name:string,
     *     workspace_id:string,
     *     workspace_name:string,
     *     project_id:string,
     *     project_name:string
     * }
     */
    public function resolve(
        ?RunTaskCallbackEvent $event = null,
        ?TaskEntity $task = null,
        ?TopicEntity $topic = null,
        ?ProjectEntity $project = null,
    ): array {
        $labels = [
            'topic_name' => trim($event?->getTopicName() ?? $topic?->getTopicName() ?? ''),
            'workspace_id' => trim($event?->getWorkspaceId() ?? ''),
            'workspace_name' => trim($event?->getWorkspaceName() ?? ''),
            'project_id' => trim($event?->getProjectId() ?? ''),
            'project_name' => trim($event?->getProjectName() ?? ''),
        ];

        if ($topic === null && $event !== null) {
            try {
                $topic = $this->topicDomainService->getTopicById($event->getTopicId());
            } catch (Throwable $throwable) {
                $this->logResolutionFailure($event, $task, $topic, 'topic', $throwable);
            }
        }

        $metadata = null;
        if ($event !== null) {
            try {
                $metadata = $event->getTaskMessage()->getMetadata();
            } catch (Throwable $throwable) {
                $this->logResolutionFailure($event, $task, $topic, 'metadata', $throwable);
            }
        }

        $labels['project_id'] = $this->firstPositiveId([
            $labels['project_id'],
            $topic?->getProjectId(),
            $task?->getProjectId(),
            $project?->getId(),
            $metadata?->getProjectId(),
        ]);
        $labels['workspace_id'] = $this->firstPositiveId([
            $labels['workspace_id'],
            $topic?->getWorkspaceId(),
            $task?->getWorkspaceId(),
            $project?->getWorkspaceId(),
            $metadata?->getWorkspaceId(),
        ]);

        if ($project !== null) {
            if ($labels['project_name'] === '') {
                $labels['project_name'] = trim($project->getProjectName());
            }
            if ((int) $labels['workspace_id'] <= 0 && ($project->getWorkspaceId() ?? 0) > 0) {
                $labels['workspace_id'] = (string) $project->getWorkspaceId();
            }
        }

        if ((int) $labels['project_id'] > 0 && ($labels['project_name'] === '' || (int) $labels['workspace_id'] <= 0)) {
            try {
                $resolvedProject = $this->projectDomainService->getProjectNotUserId((int) $labels['project_id']);
                if ($labels['project_name'] === '') {
                    $labels['project_name'] = trim($resolvedProject?->getProjectName() ?? '');
                }
                if ((int) $labels['workspace_id'] <= 0 && ($resolvedProject?->getWorkspaceId() ?? 0) > 0) {
                    $labels['workspace_id'] = (string) $resolvedProject->getWorkspaceId();
                }
            } catch (Throwable $throwable) {
                $this->logResolutionFailure($event, $task, $topic, 'project', $throwable);
            }
        }

        if ((int) $labels['workspace_id'] > 0 && $labels['workspace_name'] === '') {
            try {
                $workspace = $this->workspaceDomainService->getWorkspaceDetail((int) $labels['workspace_id']);
                $labels['workspace_name'] = trim($workspace?->getName() ?? '');
            } catch (Throwable $throwable) {
                $this->logResolutionFailure($event, $task, $topic, 'workspace', $throwable);
            }
        }

        if ($labels['topic_name'] === '' && $topic !== null) {
            $labels['topic_name'] = trim($topic->getTopicName());
        }

        return $labels;
    }

    /**
     * @param array<int, int|string|null> $candidates
     */
    private function firstPositiveId(array $candidates): string
    {
        foreach ($candidates as $candidate) {
            if ((int) $candidate > 0) {
                return (string) $candidate;
            }
        }

        return '';
    }

    private function logResolutionFailure(
        ?RunTaskCallbackEvent $event,
        ?TaskEntity $task,
        ?TopicEntity $topic,
        string $label,
        Throwable $throwable,
    ): void {
        $this->logger->warning('Resolve task notification label failed', [
            'label' => $label,
            'event_id' => $event?->getEventId(),
            'topic_id' => $event?->getTopicId() ?? $topic?->getId(),
            'task_id' => $event?->getTaskId() ?? $task?->getId(),
            'error' => $throwable->getMessage(),
        ]);
    }
}
