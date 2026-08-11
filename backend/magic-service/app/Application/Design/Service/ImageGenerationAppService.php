<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Service;

use App\Application\SuperMagic\Common\Contract\UserAiWatermarkPolicyInterface;
use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\Design\Entity\ValueObject\ImageGenerationStatus;
use App\Domain\Design\Entity\ValueObject\ImageGenerationType;
use App\Domain\Design\Factory\PathFactory;
use App\Domain\Design\Service\ImageGenerationDomainService;
use App\Domain\File\Service\FileDomainService;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\Provider\Entity\ValueObject\ProviderDataIsolation;
use App\Domain\Provider\Service\AiAbilityDomainService;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
use App\Domain\SuperMagic\Project\Entity\ValueObject\MemberRole;
use App\Domain\SuperMagic\Project\Service\ProjectDomainService;
use App\ErrorCode\DesignErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\SizeManager;
use Qbhy\HyperfAuth\Authenticatable;

/**
 * 图片生成应用服务
 */
class ImageGenerationAppService extends DesignAppService
{
    public function __construct(
        private readonly ImageGenerationDomainService $domainService,
        private readonly ProjectDomainService $projectDomainService,
        private readonly FileDomainService $fileDomainService,
        private readonly TaskFileDomainService $taskFileDomainService,
        private readonly AiAbilityDomainService $aiAbilityDomainService,
        private readonly UserAiWatermarkPolicyInterface $userAiWatermarkPolicy,
    ) {
    }

    /**
     * 生成图片（创建任务）.
     */
    public function generateImage(Authenticatable $authenticatable, ImageGenerationEntity $entity): ImageGenerationEntity
    {
        $dataIsolation = $this->createDesignDataIsolation($authenticatable);

        // 检查 project_id 是否存在
        $project = $this->projectDomainService->getProjectNotUserId($entity->getProjectId());

        // 判断是否具有该项目的权限
        $this->validateRoleHigherOrEqual($dataIsolation, $project, MemberRole::EDITOR);

        $filePrefix = $this->fileDomainService->getFullPrefix($dataIsolation->getCurrentOrganizationCode());
        $workspacePrefix = PathFactory::getWorkspacePrefix($filePrefix, $project->getId());

        // Normalize incoming path: strip workspace prefix if client sends full path
        $fileDir = $entity->getFileDir();
        if (str_starts_with($fileDir, $workspacePrefix)) {
            $fileDir = substr($fileDir, strlen($workspacePrefix));
            $entity->setFileDir($fileDir);
        }

        // Verify target directory exists via tree navigation (parent_id + name model)
        $relativeFileDir = $entity->getFileDir();
        $taskFileDir = $this->taskFileDomainService->findEntityByRelativePath($entity->getProjectId(), $relativeFileDir);
        if (! $taskFileDir || ! $taskFileDir->getIsDirectory()) {
            ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_generation.file_dir_not_exists', ['file_dir' => $relativeFileDir]);
        }
        $entity->setFileDirId($taskFileDir->getFileId());

        // Verify reference images exist; normalize full paths to relative first
        $referenceImages = $entity->getReferenceImages() ?? [];
        $normalizedReferenceImages = [];
        foreach ($referenceImages as $referenceImage) {
            // Strip workspace prefix if client sends full path
            if (str_starts_with($referenceImage, $workspacePrefix)) {
                $referenceImage = substr($referenceImage, strlen($workspacePrefix));
            }
            $normalizedReferenceImages[] = $referenceImage;

            // design-mark temp files are outside workspace; skip DB validation
            if (str_contains($referenceImage, 'design-mark/')) {
                continue;
            }

            $taskFile = $this->taskFileDomainService->findEntityByRelativePath($entity->getProjectId(), $referenceImage);
            if (! $taskFile || $taskFile->getIsDirectory()) {
                ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_generation.reference_image_not_exists', ['file_key' => $referenceImage]);
            }
        }
        if (! empty($normalizedReferenceImages)) {
            $entity->setReferenceImages($normalizedReferenceImages);
        }

        $this->domainService->createTask($dataIsolation, $entity);

        return $entity;
    }

    public function generateImages(Authenticatable $authenticatable, ImageGenerationEntity $entity): ImageGenerationEntity
    {
        $this->assertGenerateNumWithinLimit($entity);

        return $this->generateImage($authenticatable, $entity);
    }

    public function generateHighImage(Authenticatable $authenticatable, ImageGenerationEntity $entity): ImageGenerationEntity
    {
        $entity->setType(ImageGenerationType::UPSCALE);
        $entity->setPrompt('');
        // 先临时使用一个 model_id，在任务执行完成后，会修改这个值
        $entity->setModelId('design_image_high');

        // 复用生图逻辑，使用同一个表来完成
        return $this->generateImage($authenticatable, $entity);
    }

    /**
     * 橡皮擦（原图 + 标记图，擦除标记区域）.
     */
    public function generateEraser(Authenticatable $authenticatable, ImageGenerationEntity $entity): ImageGenerationEntity
    {
        $entity->setType(ImageGenerationType::ERASER);
        $this->assertImageAbilityProviderAvailable(AiAbilityCode::ImageEraser);

        $entity->setPrompt('');
        $entity->setModelId('design_image_eraser');

        return $this->generateImage($authenticatable, $entity);
    }

    /**
     * 扩图（扩展画布图 + mask 图，由模型填充扩展区域）.
     */
    public function generateExpandImage(Authenticatable $authenticatable, ImageGenerationEntity $entity): ImageGenerationEntity
    {
        $entity->setType(ImageGenerationType::EXPAND);
        $this->assertImageAbilityProviderAvailable(AiAbilityCode::ImageExpand);

        $entity->setPrompt(trim((string) ($entity->getPrompt() ?? '')));
        $entity->setModelId('design_image_expand');

        return $this->generateImage($authenticatable, $entity);
    }

    /**
     * 去背景.
     */
    public function generateRemoveBackground(Authenticatable $authenticatable, ImageGenerationEntity $entity): ImageGenerationEntity
    {
        $entity->setType(ImageGenerationType::REMOVE_BACKGROUND);
        $this->assertImageAbilityProviderAvailable(AiAbilityCode::ImageRemoveBackground);

        $entity->setPrompt('');
        // 任务完成后由专用链路产出结果，此处仅占位
        $entity->setModelId('design_image_remove_background');

        return $this->generateImage($authenticatable, $entity);
    }

    /**
     * 查询图片生成结果.
     */
    public function queryImageGeneration(Authenticatable $authenticatable, int $projectId, string $imageId): ImageGenerationEntity
    {
        $dataIsolation = $this->createDesignDataIsolation($authenticatable);

        // 检查 project_id 是否存在
        $project = $this->projectDomainService->getProjectNotUserId($projectId);

        // 判断是否具有该项目的权限
        $this->validateRoleHigherOrEqual($dataIsolation, $project, MemberRole::VIEWER);

        $entity = $this->domainService->queryByProjectAndImageId($dataIsolation, $projectId, $imageId);
        if (! $entity) {
            ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'common.not_found', ['label' => $imageId]);
        }

        $fileUrl = null;
        if ($entity->getStatus() === ImageGenerationStatus::COMPLETED) {
            // Locate generated file via tree navigation
            $taskFile = $this->taskFileDomainService->findEntityByRelativePath(
                $projectId,
                $entity->getFileDir() . $entity->getFileName()
            );
            if (! $taskFile) {
                $entity->setStatus(ImageGenerationStatus::FAILED);
                $entity->setErrorMessage('Generated file not found');
                return $entity;
            }

            $addWatermark = $this->userAiWatermarkPolicy->shouldApplyVisibleAiWatermark($authenticatable);

            $fileUrl = $this->taskFileDomainService->getFileUrls(
                projectOrganizationCode: $project->getUserOrganizationCode(),
                projectId: $project->getId(),
                fileIds: [$taskFile->getFileId()],
                downloadMode: 'preview',
                addWatermark: $addWatermark
            )[0]['url'] ?? '';
        }
        $entity->setFileUrl($fileUrl);

        return $entity;
    }

    public function queryImageGenerationResults(Authenticatable $authenticatable, int $projectId, string $imageId): ImageGenerationEntity
    {
        $dataIsolation = $this->createDesignDataIsolation($authenticatable);

        $project = $this->projectDomainService->getProjectNotUserId($projectId);
        $this->validateRoleHigherOrEqual($dataIsolation, $project, MemberRole::VIEWER);

        $entity = $this->domainService->queryByProjectAndImageId($dataIsolation, $projectId, $imageId);
        if (! $entity) {
            ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'common.not_found', ['label' => $imageId]);
        }

        if ($entity->getStatus() !== ImageGenerationStatus::COMPLETED) {
            $entity->setImages([]);
            return $entity;
        }

        $outputImages = $entity->getOutputImages() ?? [];
        if ($outputImages === [] && $entity->getFileName() !== '') {
            $outputImages[] = [
                'index' => 1,
                'file_name' => $entity->getFileName(),
                'file_path' => $entity->getFilePath(),
            ];
        }
        if ($outputImages === []) {
            $entity->setStatus(ImageGenerationStatus::FAILED);
            $entity->setErrorMessage('Generated image output is empty');
            $entity->setImages([]);
            return $entity;
        }

        $addWatermark = $this->userAiWatermarkPolicy->shouldApplyVisibleAiWatermark($authenticatable);
        $images = [];
        foreach ($outputImages as $outputImage) {
            $filePath = (string) ($outputImage['file_path'] ?? '');
            $fileName = (string) ($outputImage['file_name'] ?? '');
            if ($filePath === '' && $fileName !== '') {
                $filePath = rtrim($entity->getFileDir(), '/') . '/' . $fileName;
            }

            $taskFile = $this->taskFileDomainService->findEntityByRelativePath($projectId, $filePath);
            if (! $taskFile) {
                $entity->setStatus(ImageGenerationStatus::FAILED);
                $entity->setErrorMessage('Generated image file not found');
                $entity->setImages([]);
                return $entity;
            }

            $images[] = [
                'index' => (int) ($outputImage['index'] ?? count($images) + 1),
                'file_name' => $fileName,
                'file_url' => $this->taskFileDomainService->getFileUrls(
                    projectOrganizationCode: $project->getUserOrganizationCode(),
                    projectId: $project->getId(),
                    fileIds: [$taskFile->getFileId()],
                    downloadMode: 'preview',
                    addWatermark: $addWatermark
                )[0]['url'] ?? '',
            ];
        }

        $entity->setImages($images);

        return $entity;
    }

    private function assertImageAbilityProviderAvailable(AiAbilityCode $code): void
    {
        $entity = $this->aiAbilityDomainService->getByCode(ProviderDataIsolation::create('')->disabled(), $code);

        if ($entity === null || ! $entity->isEnabled()) {
            ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_generation.feature_unavailable');
        }

        $providers = $entity->getConfig()['providers'] ?? [];
        if (! is_array($providers)) {
            ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_generation.feature_unavailable');
        }

        foreach ($providers as $provider) {
            if (is_array($provider) && ($provider['enable'] ?? false) === true) {
                return;
            }
        }

        ExceptionBuilder::throw(DesignErrorCode::InvalidArgument, 'design.image_generation.feature_unavailable');
    }

    private function assertGenerateNumWithinLimit(ImageGenerationEntity $entity): void
    {
        $generateNum = $entity->getGenerateNum();
        $maxOutputImages = SizeManager::getMaxOutputImages($entity->getModelId(), $entity->getModelId());
        if ($generateNum <= $maxOutputImages) {
            return;
        }

        ExceptionBuilder::throw(
            DesignErrorCode::InvalidArgument,
            'design.image_generation.generate_num_exceeds_limit',
            [
                'limit' => $maxOutputImages,
                'requested' => $generateNum,
            ]
        );
    }
}
