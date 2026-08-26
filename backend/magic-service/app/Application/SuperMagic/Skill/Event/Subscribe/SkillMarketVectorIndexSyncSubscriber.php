<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Skill\Event\Subscribe;

use App\Domain\SuperMagic\Skill\Event\SkillMarketBatchReindexRequestedEvent;
use App\Domain\SuperMagic\Skill\Event\SkillMarketCreatedEvent;
use App\Domain\SuperMagic\Skill\Event\SkillMarketOfflineEvent;
use App\Domain\SuperMagic\Skill\Event\SkillMarketPublishedEvent;
use App\Domain\SuperMagic\Skill\Event\SkillMarketUpdatedEvent;
use App\Domain\SuperMagic\Skill\Service\SkillMarketVectorIndexDomainService;
use Dtyq\AsyncEvent\AsyncEventUtil;
use Dtyq\AsyncEvent\Kernel\Annotation\AsyncListener;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Throwable;

#[AsyncListener(driver: 'queue_amqp')]
#[Listener]
final readonly class SkillMarketVectorIndexSyncSubscriber implements ListenerInterface
{
    private LoggerInterface $logger;

    public function __construct(
        private SkillMarketVectorIndexDomainService $domainService,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get('vector-index-sync');
    }

    public function listen(): array
    {
        return [
            SkillMarketCreatedEvent::class,
            SkillMarketPublishedEvent::class,
            SkillMarketUpdatedEvent::class,
            SkillMarketOfflineEvent::class,
            SkillMarketBatchReindexRequestedEvent::class,
        ];
    }

    /** Dispatch each market event to the domain-level index synchronizer. */
    public function process(object $event): void
    {
        if ($event instanceof SkillMarketBatchReindexRequestedEvent) {
            $this->processBatch($event);
            return;
        }

        if (! $event instanceof SkillMarketCreatedEvent
            && ! $event instanceof SkillMarketPublishedEvent
            && ! $event instanceof SkillMarketUpdatedEvent
            && ! $event instanceof SkillMarketOfflineEvent) {
            return;
        }

        $this->syncOne($event->skillMarketId, $event->operatorId);
    }

    private function syncOne(string $skillMarketId, string $operatorId, bool $forceReEmbedding = false): void
    {
        $context = [
            'resource_type' => 'skill_market',
            'resource_id' => $skillMarketId,
            'operator_id' => $operatorId,
        ];

        try {
            $this->logger->info('Skill market vector index sync started', $context);
            $this->domainService->sync($skillMarketId, $operatorId, $forceReEmbedding);
            $this->logger->info('Skill market vector index sync completed', $context);
        } catch (Throwable $throwable) {
            $this->logger->error('Skill market vector index sync failed', $context + [
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
            throw $throwable;
        }
    }

    private function processBatch(SkillMarketBatchReindexRequestedEvent $event): void
    {
        // Let the queue apply its bounded retry policy to a single failed item.
        if (count($event->skillMarketIds) === 1) {
            $this->syncOne(
                $event->skillMarketIds[0],
                $event->operatorId,
                $event->forceReEmbedding,
            );
            return;
        }

        $failedIds = $this->domainService->reindexBatch(
            $event->skillMarketIds,
            $event->operatorId,
            $event->forceReEmbedding,
        );
        foreach (array_values(array_unique($failedIds)) as $failedId) {
            AsyncEventUtil::dispatch(new SkillMarketBatchReindexRequestedEvent(
                [$failedId],
                $event->organizationCode,
                $event->operatorId,
                $event->forceReEmbedding,
            ));
        }
    }
}
