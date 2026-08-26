<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Provider\Event\Subscribe;

use App\Application\SuperMagic\Skill\Service\AdminSkillAppService;
use App\Domain\Provider\Entity\AiAbilityEntity;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\Provider\Event\AiAbilityUpdatedEvent;
use Dtyq\AsyncEvent\Kernel\Annotation\AsyncListener;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Throwable;

#[AsyncListener(driver: 'queue_amqp')]
#[Listener]
final readonly class SkillMarketVectorIndexReindexSubscriber implements ListenerInterface
{
    private LoggerInterface $logger;

    public function __construct(
        private AdminSkillAppService $adminSkillAppService,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get('vector-index-sync');
    }

    public function listen(): array
    {
        return [AiAbilityUpdatedEvent::class];
    }

    /** Reindex market points after the shared embedding model changes. */
    public function process(object $event): void
    {
        if (! $event instanceof AiAbilityUpdatedEvent || ! $this->shouldReindex($event->oldEntity, $event->newEntity)) {
            return;
        }

        $organizationCode = $event->newEntity->getOrganizationCode();
        try {
            $result = $this->queueAllMarketVectors($organizationCode);
            $this->logger->info('Skill market full vector sync queued after embedding ability update', [
                'organization_code' => $organizationCode,
                'queued' => $result['queued'] ?? 0,
                'model_id' => $this->modelId($event->newEntity),
            ]);
        } catch (Throwable $throwable) {
            $this->logger->error('Skill market full vector sync failed after embedding ability update', [
                'organization_code' => $organizationCode,
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
            throw $throwable;
        }
    }

    /** Reindex only when the target ability is enabled and its model changed. */
    private function shouldReindex(AiAbilityEntity $oldEntity, AiAbilityEntity $newEntity): bool
    {
        if ($newEntity->getCode() !== AiAbilityCode::KnowledgeBaseEmbeddingModel || ! $newEntity->isEnabled()) {
            return false;
        }

        return ! $oldEntity->isEnabled() || $this->modelId($oldEntity) !== $this->modelId($newEntity);
    }

    private function modelId(AiAbilityEntity $entity): string
    {
        return trim((string) ($entity->getConfig()['model_id'] ?? ''));
    }

    /** Queue all visible market records as bounded technical events. */
    private function queueAllMarketVectors(string $organizationCode): array
    {
        $afterId = '0';
        $queued = 0;
        while (true) {
            $result = $this->adminSkillAppService->queueMarketVectorReindex(
                $organizationCode,
                'system',
                afterId: $afterId,
                batchSize: 100,
                forceReEmbedding: true,
            );
            $queued += $result['queued'];
            $nextAfterId = (string) $result['after_id'];
            if (! $result['has_more'] || $nextAfterId === $afterId) {
                break;
            }
            $afterId = $nextAfterId;
        }

        return ['queued' => $queued];
    }
}
