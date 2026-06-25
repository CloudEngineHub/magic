<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Event\Subscribe;

use App\Application\Design\Service\DesignImageOperationConcurrencyService;
use App\Application\Design\Tool\ImageGeneration\DesignGeneratedImageFileNameTool;
use App\Application\Design\Tool\ImageGeneration\DesignImageGenerationTaskHandlerFactory;
use App\Domain\Contact\Entity\ValueObject\DataIsolation as ContactDataIsolation;
use App\Domain\Design\Entity\DesignDataIsolation;
use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\Design\Event\ImageGenerationTaskCreatedEvent;
use App\Domain\Design\Factory\PathFactory;
use App\Domain\Design\Service\ImageGenerationDomainService;
use App\Domain\File\Service\FileDomainService;
use App\ErrorCode\DesignErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\OpenAIFormatResponse;
use App\Infrastructure\Util\Concurrency\ConcurrencyLease;
use Dtyq\AsyncEvent\Kernel\Annotation\AsyncListener;
use Dtyq\CloudFile\Kernel\Struct\UploadFile;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TaskFileEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\FileType;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\TaskFileSource;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\ProjectDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\TaskFileDomainService;
use Hyperf\DbConnection\Db;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Container\ContainerInterface;
use Psr\Log\LoggerInterface;
use Throwable;

use function Hyperf\Support\retry;

#[AsyncListener(driver: 'coroutine', waitForSync: false)]
#[Listener]
class DesignImageGenerationSubscriber implements ListenerInterface
{
    private ImageGenerationDomainService $imageGenerationDomainService;

    private TaskFileDomainService $taskFileDomainService;

    private FileDomainService $fileDomainService;

    private ProjectDomainService $projectDomainService;

    private DesignGeneratedImageFileNameTool $generatedImageFileNameTool;

    private DesignImageOperationConcurrencyService $concurrencyService;

    private LoggerInterface $logger;

    public function __construct(ContainerInterface $container)
    {
        $this->imageGenerationDomainService = $container->get(ImageGenerationDomainService::class);
        $this->taskFileDomainService = $container->get(TaskFileDomainService::class);
        $this->fileDomainService = $container->get(FileDomainService::class);
        $this->projectDomainService = $container->get(ProjectDomainService::class);
        $this->generatedImageFileNameTool = $container->get(DesignGeneratedImageFileNameTool::class);
        $this->concurrencyService = $container->get(DesignImageOperationConcurrencyService::class);
        $this->logger = $container->get(LoggerFactory::class)->get(static::class);
    }

    public function listen(): array
    {
        return [
            ImageGenerationTaskCreatedEvent::class,
        ];
    }

    public function process(object $event): void
    {
        if (! $event instanceof ImageGenerationTaskCreatedEvent) {
            return;
        }
        $imageGenerationEntity = $event->imageGenerationEntity;

        $dataIsolation = DesignDataIsolation::create($imageGenerationEntity->getOrganizationCode(), $imageGenerationEntity->getUserId());

        $lease = ConcurrencyLease::unlimited((string) $imageGenerationEntity->getId());
        try {
            if ($this->concurrencyService->supports($imageGenerationEntity)) {
                $this->logger->info('design image operation concurrency acquire start', $this->buildConcurrencyLogContext($imageGenerationEntity));

                // 擦除/扩图先抢并发槽；抢不到则保持 pending，等待定时任务重新投递。
                $lease = $this->concurrencyService->tryAcquire($imageGenerationEntity);
                $this->logger->info('design image operation concurrency acquire end', $this->buildConcurrencyLogContext($imageGenerationEntity, $lease));
                if (! $lease->canProceed()) {
                    return;
                }

                // 后续 return/异常都会进入 finally，已抢到的槽会在那里统一释放。
                if (! $this->imageGenerationDomainService->tryMarkAsProcessing($dataIsolation, $imageGenerationEntity->getId())) {
                    return;
                }
            } else {
                $this->imageGenerationDomainService->markAsProcessing($dataIsolation, $imageGenerationEntity->getId());
            }

            $response = $this->invokeImageGenerationHandler($dataIsolation, $imageGenerationEntity);
            if (! $response) {
                ExceptionBuilder::throw(DesignErrorCode::ThirdPartyServiceError, 'design.image_generation.generate_image_failed');
            }
            if (! empty($response->getProviderErrorMessage())) {
                $errorMessage = $response->getProviderErrorMessage();
                if (str_contains($errorMessage, '缺少图像数据')) {
                    // 根据是否有参考图选择不同的错误提示
                    $hasReferenceImages = ! empty($imageGenerationEntity->getReferenceImages());
                    $translationKey = $hasReferenceImages
                        ? 'design.image_generation.missing_image_data_error_with_reference'
                        : 'design.image_generation.missing_image_data_error_prompt_only';
                    ExceptionBuilder::throw(DesignErrorCode::ThirdPartyServiceError, $translationKey);
                }
                ExceptionBuilder::throw(DesignErrorCode::ThirdPartyServiceError, 'design.image_generation.generate_image_failed_with_message', ['message' => $errorMessage]);
            }
            $imageUrl = $this->parseResponseUrl($response);
            if (empty($imageUrl)) {
                ExceptionBuilder::throw(DesignErrorCode::ThirdPartyServiceError, 'design.image_generation.generate_image_failed');
            }

            $fileName = $this->resolveAndAssignGeneratedFileName($dataIsolation, $imageGenerationEntity, $imageUrl);
            $this->ensureOutputDirectoryId($imageGenerationEntity);

            Db::transaction(function () use ($dataIsolation, $imageGenerationEntity, $imageUrl, $fileName): void {
                $this->imageGenerationDomainService->markAsCompleted($dataIsolation, $imageGenerationEntity->getId(), $fileName);

                $fullPrefix = $this->fileDomainService->getFullPrefix($dataIsolation->getCurrentOrganizationCode());
                $fullFileDir = $imageGenerationEntity->getFullFileDir($fullPrefix);

                $uploadPath = substr($fullFileDir, strlen($fullPrefix));
                $uploadFile = new UploadFile($imageUrl, $uploadPath, $fileName, false);

                $this->createProjectFile($dataIsolation, $imageGenerationEntity, $uploadFile);

                $this->fileDomainService->uploadByCredential($dataIsolation->getCurrentOrganizationCode(), $uploadFile, StorageBucketType::SandBox, false);
            });
        } catch (Throwable $throwable) {
            $this->imageGenerationDomainService->markAsFailed($dataIsolation, $imageGenerationEntity->getId(), $throwable->getMessage());
        } finally {
            if ($lease->ownsSlot()) {
                $this->logger->info('design image operation concurrency release start', $this->buildConcurrencyLogContext($imageGenerationEntity, $lease));
                $released = $this->concurrencyService->release($lease);
                $this->logger->info('design image operation concurrency release end', $this->buildConcurrencyLogContext($imageGenerationEntity, $lease, [
                    'released' => $released,
                ]));
            }
        }
    }

    protected function createProjectFile(DesignDataIsolation $dataIsolation, ImageGenerationEntity $imageGenerationEntity, UploadFile $uploadFile): void
    {
        $contactDataIsolation = ContactDataIsolation::simpleMake($dataIsolation->getCurrentOrganizationCode(), $dataIsolation->getCurrentUserId());

        $project = $this->projectDomainService->getProjectNotUserId($imageGenerationEntity->getProjectId());
        if (! $project) {
            ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_generation.project_not_exists', ['project_id' => $imageGenerationEntity->getProjectId()]);
        }
        $filePrefix = $this->fileDomainService->getFullPrefix($dataIsolation->getCurrentOrganizationCode());

        $taskFileEntity = new TaskFileEntity();
        $taskFileEntity->setFileKey($imageGenerationEntity->getFullFilePath($filePrefix));
        $taskFileEntity->setSource(TaskFileSource::AI_IMAGE_GENERATION);
        $taskFileEntity->setFileName($imageGenerationEntity->getFileName());
        $taskFileEntity->setFileType(FileType::SYSTEM_AUTO_UPLOAD->value);
        $taskFileEntity->setFileSize($uploadFile->getSize());
        $taskFileEntity->setIsDirectory(false);
        $taskFileEntity->setParentId($imageGenerationEntity->getFileDirId());

        $this->taskFileDomainService->saveProjectFile(dataIsolation: $contactDataIsolation, projectEntity: $project, taskFileEntity: $taskFileEntity, isUpdated: false);
    }

    /**
     * 队列恢复的任务来自数据库，创建时的 fileDirId 不会随实体持久化，缺失时按 file_dir 重新解析真实输出目录。
     */
    private function ensureOutputDirectoryId(ImageGenerationEntity $imageGenerationEntity): void
    {
        $fileDirId = $imageGenerationEntity->getFileDirId();
        if ($fileDirId > 0) {
            return;
        }

        $taskFileDir = $this->taskFileDomainService->findEntityByRelativePath(
            $imageGenerationEntity->getProjectId(),
            $imageGenerationEntity->getFileDir()
        );
        if (! $this->isValidOutputDirectory($imageGenerationEntity, $taskFileDir)) {
            ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_generation.file_dir_not_exists', [
                'file_dir' => $imageGenerationEntity->getFileDir(),
            ]);
        }

        $imageGenerationEntity->setFileDirId($taskFileDir->getFileId());
    }

    private function isValidOutputDirectory(ImageGenerationEntity $imageGenerationEntity, ?TaskFileEntity $taskFileDir): bool
    {
        return $taskFileDir instanceof TaskFileEntity
            && $taskFileDir->getIsDirectory()
            && $taskFileDir->getProjectId() === $imageGenerationEntity->getProjectId();
    }

    /**
     * 按任务类型解析 Handler 并执行生图（含一次重试）。
     */
    private function invokeImageGenerationHandler(DesignDataIsolation $dataIsolation, ImageGenerationEntity $imageGenerationEntity): ?OpenAIFormatResponse
    {
        $handler = DesignImageGenerationTaskHandlerFactory::get($imageGenerationEntity->getType());
        if ($handler === null) {
            return null;
        }

        $filePrefix = $this->fileDomainService->getFullPrefix($dataIsolation->getCurrentOrganizationCode());
        $workspacePrefix = PathFactory::getWorkspacePrefix($filePrefix, $imageGenerationEntity->getProjectId());

        $response = null;
        retry(1, function () use (&$response, $handler, $dataIsolation, $imageGenerationEntity, $workspacePrefix) {
            $response = $handler->handle($dataIsolation, $imageGenerationEntity, $workspacePrefix);
        }, 1000);

        return $response;
    }

    /**
     * 根据结果图 URL 解析扩展名、生成目标文件名并写入实体，返回带扩展名的完整文件名。
     */
    private function resolveAndAssignGeneratedFileName(
        DesignDataIsolation $dataIsolation,
        ImageGenerationEntity $entity,
        string $imageUrl,
    ): string {
        $extension = pathinfo((string) parse_url($imageUrl, PHP_URL_PATH), PATHINFO_EXTENSION);
        $fileNameWithoutExtension = $this->generatedImageFileNameTool->resolveBaseNameWithoutExtension(
            $dataIsolation,
            $entity,
            $entity->getPrompt(),
        );
        $fileName = $fileNameWithoutExtension . '.' . $extension;
        $entity->setFileName($fileName);

        return $fileName;
    }

    private function parseResponseUrl(OpenAIFormatResponse $response): string
    {
        // 目前我们只会生成一个，所以这里直接取第一个
        $data = $response->getData();
        if (isset($data[0]['url'])) {
            return $data[0]['url'];
        }
        return '';
    }

    /**
     * 并发限制日志只记录排查必需字段，避免输出图片地址、prompt 等业务内容。
     *
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    private function buildConcurrencyLogContext(ImageGenerationEntity $entity, ?ConcurrencyLease $lease = null, array $extra = []): array
    {
        $context = [
            'task_id' => $entity->getId(),
            'type' => $entity->getType()->value,
            'project_id' => $entity->getProjectId(),
            'organization_code' => $entity->getOrganizationCode(),
            'user_id' => $entity->getUserId(),
        ];

        if ($lease !== null) {
            $context += [
                'pool_name' => $lease->getPoolName(),
                'resource_id' => $lease->getResourceId(),
                'can_proceed' => $lease->canProceed(),
                'owns_slot' => $lease->ownsSlot(),
            ];
        }

        return $context + $extra;
    }
}
