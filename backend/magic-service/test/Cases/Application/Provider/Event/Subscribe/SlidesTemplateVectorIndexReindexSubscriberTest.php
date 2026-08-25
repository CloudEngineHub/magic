<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Provider\Event\Subscribe;

use App\Application\Provider\Event\Subscribe\SlidesTemplateVectorIndexReindexSubscriber;
use App\Application\SlidesTemplate\Service\AdminSlidesTemplateAppService;
use App\Domain\Provider\Entity\AiAbilityEntity;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\Provider\Entity\ValueObject\Status;
use App\Domain\Provider\Event\AiAbilityUpdatedEvent;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

/**
 * @internal
 */
final class SlidesTemplateVectorIndexReindexSubscriberTest extends TestCase
{
    public function testEmbeddingModelChangeQueuesOfficialSlidesTemplateReindex(): void
    {
        $oldEntity = $this->ability(Status::Enabled, 'old-model');
        $newEntity = $this->ability(Status::Enabled, 'new-model');
        $slidesTemplateAppService = $this->createMock(AdminSlidesTemplateAppService::class);
        $slidesTemplateAppService->expects(self::once())
            ->method('reindexOfficialVectorIndex')
            ->with(OfficialOrganizationUtil::getOfficialOrganizationCode());

        $listener = new SlidesTemplateVectorIndexReindexSubscriber($slidesTemplateAppService, $this->loggerFactory());
        $listener->process(new AiAbilityUpdatedEvent($oldEntity, $newEntity));
    }

    public function testUnrelatedAbilityChangeDoesNotQueueSlidesTemplateReindex(): void
    {
        $oldEntity = $this->ability(Status::Enabled, 'old-model');
        $newEntity = $this->ability(Status::Enabled, 'new-model');
        $newEntity->setCode(AiAbilityCode::Ocr);
        $slidesTemplateAppService = $this->createMock(AdminSlidesTemplateAppService::class);
        $slidesTemplateAppService->expects(self::never())->method('reindexOfficialVectorIndex');

        $listener = new SlidesTemplateVectorIndexReindexSubscriber($slidesTemplateAppService, $this->loggerFactory());
        $listener->process(new AiAbilityUpdatedEvent($oldEntity, $newEntity));
    }

    public function testEnablingEmbeddingModelQueuesOfficialSlidesTemplateReindex(): void
    {
        $oldEntity = $this->ability(Status::Disabled, 'same-model');
        $newEntity = $this->ability(Status::Enabled, 'same-model');
        $slidesTemplateAppService = $this->createMock(AdminSlidesTemplateAppService::class);
        $slidesTemplateAppService->expects(self::once())->method('reindexOfficialVectorIndex');

        $listener = new SlidesTemplateVectorIndexReindexSubscriber($slidesTemplateAppService, $this->loggerFactory());
        $listener->process(new AiAbilityUpdatedEvent($oldEntity, $newEntity));
    }

    public function testUnchangedEmbeddingModelDoesNotQueueSlidesTemplateReindex(): void
    {
        $oldEntity = $this->ability(Status::Enabled, 'same-model');
        $newEntity = $this->ability(Status::Enabled, 'same-model');
        $slidesTemplateAppService = $this->createMock(AdminSlidesTemplateAppService::class);
        $slidesTemplateAppService->expects(self::never())->method('reindexOfficialVectorIndex');

        $listener = new SlidesTemplateVectorIndexReindexSubscriber($slidesTemplateAppService, $this->loggerFactory());
        $listener->process(new AiAbilityUpdatedEvent($oldEntity, $newEntity));
    }

    public function testDisablingEmbeddingModelDoesNotQueueSlidesTemplateReindex(): void
    {
        $oldEntity = $this->ability(Status::Enabled, 'same-model');
        $newEntity = $this->ability(Status::Disabled, 'same-model');
        $slidesTemplateAppService = $this->createMock(AdminSlidesTemplateAppService::class);
        $slidesTemplateAppService->expects(self::never())->method('reindexOfficialVectorIndex');

        $listener = new SlidesTemplateVectorIndexReindexSubscriber($slidesTemplateAppService, $this->loggerFactory());
        $listener->process(new AiAbilityUpdatedEvent($oldEntity, $newEntity));
    }

    public function testNonOfficialOrganizationDoesNotQueueSlidesTemplateReindex(): void
    {
        $oldEntity = $this->ability(Status::Enabled, 'old-model');
        $newEntity = $this->ability(Status::Enabled, 'new-model');
        $newEntity->setOrganizationCode('OTHER_ORG');
        $slidesTemplateAppService = $this->createMock(AdminSlidesTemplateAppService::class);
        $slidesTemplateAppService->expects(self::never())->method('reindexOfficialVectorIndex');

        $listener = new SlidesTemplateVectorIndexReindexSubscriber($slidesTemplateAppService, $this->loggerFactory());
        $listener->process(new AiAbilityUpdatedEvent($oldEntity, $newEntity));
    }

    private function ability(Status $status, string $modelId): AiAbilityEntity
    {
        $entity = new AiAbilityEntity();
        $entity->setCode(AiAbilityCode::KnowledgeBaseEmbeddingModel);
        $entity->setOrganizationCode(OfficialOrganizationUtil::getOfficialOrganizationCode());
        $entity->setStatus($status);
        $entity->setConfig(['model_id' => $modelId]);
        return $entity;
    }

    private function loggerFactory(): LoggerFactory
    {
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn(new NullLogger());
        return $loggerFactory;
    }
}
