<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Design\Service;

use App\Application\Design\Event\Publish\DesignVideoSubmitPublisher;
use App\Application\Design\Service\DesignVideoFirstPollRecoveryAppService;
use App\Domain\Design\Entity\DesignDataIsolation;
use App\Domain\Design\Entity\DesignGenerationTaskEntity;
use App\Domain\Design\Entity\Dto\DesignVideoCreateDTO;
use App\Domain\Design\Entity\ValueObject\DesignGenerationAssetType;
use App\Domain\Design\Entity\ValueObject\DesignGenerationStatus;
use App\Domain\Design\Entity\ValueObject\DesignGenerationType;
use App\Domain\Design\Factory\DesignGenerationTaskFactory;
use App\Domain\Design\Repository\Facade\DesignGenerationTaskRepositoryInterface;
use App\Domain\Design\Service\DesignGenerationTaskDomainService;
use DateTime;
use Hyperf\Amqp\Producer;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @internal
 */
class DesignVideoFirstPollRecoveryAppServiceTest extends TestCase
{
    public function testCanvasCompositionWithoutOperationIdRecoversSubmissionMessage(): void
    {
        $entity = $this->createPendingCanvasCompositionEntity();
        $repository = new RecoveryInMemoryDesignVideoTaskRepository($entity);
        $producer = $this->createMock(Producer::class);
        $producer->expects($this->once())
            ->method('produce')
            ->with($this->isInstanceOf(DesignVideoSubmitPublisher::class));

        $service = new DesignVideoFirstPollRecoveryAppService(
            new DesignGenerationTaskDomainService($repository),
            $producer,
            $this->createMock(LoggerInterface::class),
        );

        $service->recover();

        $this->assertSame('sent', $entity->getFirstPollStatus());
        $this->assertSame(1, $repository->updateCount);
    }

    /**
     * 非画布任务空 operation_id 且超出宽限期 = 提交过程中断，必须收敛为失败，
     * 否则该行会永远停在 pending，被每分钟重复扫到。
     */
    public function testInterruptedSubmitBeyondGracePeriodIsMarkedFailed(): void
    {
        $entity = $this->createPendingVideoEntity();
        $entity->setUpdatedAt(new DateTime('-20 minutes'));
        $repository = new RecoveryInMemoryDesignVideoTaskRepository($entity);
        $producer = $this->createMock(Producer::class);
        $producer->expects($this->never())->method('produce');

        $service = new DesignVideoFirstPollRecoveryAppService(
            new DesignGenerationTaskDomainService($repository),
            $producer,
            $this->createMock(LoggerInterface::class),
        );

        $service->recover();

        $this->assertSame(DesignGenerationStatus::FAILED, $entity->getStatus());
        $this->assertNotNull($entity->getErrorMessage());
        $this->assertSame(1, $repository->updateCount);
    }

    /** 宽限期内不判定为中断，避免误杀仍在同步提交中的任务。 */
    public function testInterruptedSubmitWithinGracePeriodIsLeftUntouched(): void
    {
        $entity = $this->createPendingVideoEntity();
        $repository = new RecoveryInMemoryDesignVideoTaskRepository($entity);
        $producer = $this->createMock(Producer::class);
        $producer->expects($this->never())->method('produce');

        $service = new DesignVideoFirstPollRecoveryAppService(
            new DesignGenerationTaskDomainService($repository),
            $producer,
            $this->createMock(LoggerInterface::class),
        );

        $service->recover();

        $this->assertSame(DesignGenerationStatus::PENDING, $entity->getStatus());
        $this->assertSame(0, $repository->updateCount);
    }

    /** 创建尚未提交到沙箱的画布合成任务。 */
    private function createPendingCanvasCompositionEntity(): DesignGenerationTaskEntity
    {
        $entity = DesignGenerationTaskFactory::createVideoTask(new DesignVideoCreateDTO([
            'project_id' => 123,
            'video_id' => 'composition-recovery-1',
            'generation_type' => DesignGenerationType::CANVAS_COMPOSITION->value,
            'topic_id' => '456',
            'extensions' => [
                'project_path' => 'canvas-project',
                'video_edit_element_id' => 'video-edit-1',
            ],
        ]));
        $entity->setOrganizationCode('org');
        $entity->setUserId('user-1');
        $entity->prepareForCreate();
        $entity->setId(1001);

        return $entity;
    }

    /** 创建尚未完成上游提交的普通视频任务（operation_id 为空）。 */
    private function createPendingVideoEntity(): DesignGenerationTaskEntity
    {
        $entity = DesignGenerationTaskFactory::createVideoTask(new DesignVideoCreateDTO([
            'project_id' => 123,
            'video_id' => 'video-recovery-1',
            'generation_type' => DesignGenerationType::TEXT_TO_VIDEO->value,
            'model_id' => 'doubao-seedance-2.5',
            'prompt' => 'a cat walking on the beach',
            'file_dir' => 'design/videos',
        ]));
        $entity->setOrganizationCode('org');
        $entity->setUserId('user-1');
        $entity->prepareForCreate();
        $entity->setId(1002);

        return $entity;
    }
}

/** 为恢复服务测试提供待处理任务。 */
class RecoveryInMemoryDesignVideoTaskRepository implements DesignGenerationTaskRepositoryInterface
{
    public int $updateCount = 0;

    public function __construct(private readonly DesignGenerationTaskEntity $entity)
    {
    }

    public function create(DesignDataIsolation $dataIsolation, DesignGenerationTaskEntity $entity): void
    {
    }

    public function update(DesignDataIsolation $dataIsolation, DesignGenerationTaskEntity $entity): void
    {
        ++$this->updateCount;
    }

    public function delete(DesignDataIsolation $dataIsolation, DesignGenerationTaskEntity $entity): void
    {
    }

    public function findByProjectAndGenerationId(
        DesignDataIsolation $dataIsolation,
        int $projectId,
        DesignGenerationAssetType $assetType,
        string $generationId
    ): ?DesignGenerationTaskEntity {
        return null;
    }

    public function findProcessingTasksBeforeId(int $cursorId, int $limit): array
    {
        if (($this->entity->getId() ?? 0) >= $cursorId) {
            return [];
        }

        return [$this->entity];
    }
}
