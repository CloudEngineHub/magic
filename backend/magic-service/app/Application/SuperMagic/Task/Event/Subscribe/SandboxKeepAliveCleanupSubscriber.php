<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Task\Event\Subscribe;

use App\Domain\SuperMagic\Project\Event\ProjectDeletedEvent;
use App\Domain\SuperMagic\Project\Event\ProjectsBatchDeletedEvent;
use App\Domain\SuperMagic\Task\Service\SandboxKeepAliveDomainService;
use App\Domain\SuperMagic\Topic\Event\TopicDeletedEvent;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Throwable;

#[Listener]
class SandboxKeepAliveCleanupSubscriber implements ListenerInterface
{
    private LoggerInterface $logger;

    public function __construct(
        private readonly SandboxKeepAliveDomainService $sandboxKeepAliveDomainService,
        LoggerFactory $loggerFactory
    ) {
        $this->logger = $loggerFactory->get(self::class);
    }

    public function listen(): array
    {
        return [
            ProjectDeletedEvent::class,
            ProjectsBatchDeletedEvent::class,
            TopicDeletedEvent::class,
        ];
    }

    public function process(object $event): void
    {
        try {
            match (true) {
                $event instanceof ProjectDeletedEvent => $this->handleProjectDeleted($event),
                $event instanceof ProjectsBatchDeletedEvent => $this->handleProjectsBatchDeleted($event),
                $event instanceof TopicDeletedEvent => $this->handleTopicDeleted($event),
                default => null,
            };
        } catch (Throwable $throwable) {
            $this->logger->error('Sandbox keep alive cleanup failed', [
                'event' => get_class($event),
                'error' => $throwable->getMessage(),
                'trace' => $throwable->getTraceAsString(),
            ]);
        }
    }

    private function handleProjectDeleted(ProjectDeletedEvent $event): void
    {
        $project = $event->getProjectEntity();
        $affected = $this->sandboxKeepAliveDomainService->disableByProjectId(
            $project->getId(),
            'project deleted'
        );

        $this->logger->info('Disabled sandbox keep alive records for deleted project', [
            'project_id' => $project->getId(),
            'affected' => $affected,
        ]);
    }

    private function handleProjectsBatchDeleted(ProjectsBatchDeletedEvent $event): void
    {
        $projectIds = $event->getProjectIds();
        $affected = $this->sandboxKeepAliveDomainService->disableByProjectIds(
            $projectIds,
            'project batch deleted'
        );

        $this->logger->info('Disabled sandbox keep alive records for batch deleted projects', [
            'project_ids' => $projectIds,
            'affected' => $affected,
        ]);
    }

    private function handleTopicDeleted(TopicDeletedEvent $event): void
    {
        $topic = $event->getTopicEntity();
        $disabled = $this->sandboxKeepAliveDomainService->disableByTopic(
            $topic->getId(),
            'topic deleted'
        );

        $this->logger->info('Disabled sandbox keep alive record for deleted topic', [
            'topic_id' => $topic->getId(),
            'project_id' => $topic->getProjectId(),
            'disabled' => $disabled,
        ]);
    }
}
