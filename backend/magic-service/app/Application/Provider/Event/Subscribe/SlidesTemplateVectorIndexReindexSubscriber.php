<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Provider\Event\Subscribe;

use App\Application\SlidesTemplate\Service\AdminSlidesTemplateAppService;
use App\Domain\Provider\Entity\AiAbilityEntity;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\Provider\Event\AiAbilityUpdatedEvent;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use Dtyq\AsyncEvent\Kernel\Annotation\AsyncListener;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Throwable;

#[AsyncListener(driver: 'queue_amqp')]
#[Listener]
final readonly class SlidesTemplateVectorIndexReindexSubscriber implements ListenerInterface
{
    private LoggerInterface $logger;

    public function __construct(
        private AdminSlidesTemplateAppService $adminSlidesTemplateAppService,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get('vector-index-sync');
    }

    public function listen(): array
    {
        return [AiAbilityUpdatedEvent::class];
    }

    public function process(object $event): void
    {
        if (! $event instanceof AiAbilityUpdatedEvent || ! $this->shouldReindex($event->oldEntity, $event->newEntity)) {
            return;
        }

        $organizationCode = $event->newEntity->getOrganizationCode();
        if ($organizationCode !== OfficialOrganizationUtil::getOfficialOrganizationCode()) {
            return;
        }

        try {
            $result = $this->adminSlidesTemplateAppService->reindexOfficialVectorIndex($organizationCode);
            $this->logger->info('Slides template full vector sync queued after embedding ability update', [
                'organization_code' => $organizationCode,
                'queued' => $result['queued'] ?? 0,
                'model_id' => $this->modelId($event->newEntity),
            ]);
        } catch (Throwable $throwable) {
            $this->logger->error('Slides template full vector sync failed after embedding ability update', [
                'organization_code' => $organizationCode,
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
            throw $throwable;
        }
    }

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
}
