<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Application\SlidesTemplate\DTO\SlidesTemplateProjectExportResult;
use App\Application\SuperMagic\Common\Service\AbstractAppService;
use App\Domain\Contact\Entity\ValueObject\DataIsolation as ContactDataIsolation;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SuperMagic\Common\Entity\ValueObject\StorageType;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\Domain\SuperMagic\Task\Entity\ValueObject\TaskStatus;
use App\Domain\SuperMagic\Task\Service\AgentDomainService;
use App\Domain\SuperMagic\Task\Service\TaskDomainService;
use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Workspace\Request\ExportWorkspaceRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Workspace\WorkspaceExporterInterface;
use App\Infrastructure\SuperMagic\Utils\RelativeFilePathUtil;
use App\Infrastructure\SuperMagic\Utils\WorkDirectoryUtil;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use RuntimeException;

final class SlidesTemplateProjectExportService extends AbstractAppService
{
    private const string EXPORT_TYPE = 'slides_template_creator';

    private const string EXPORT_PROMPT = 'Slides Template Export Task';

    public function __construct(
        private readonly TaskFileDomainService $taskFileDomainService,
        private readonly CloudFileRepositoryInterface $cloudFileRepository,
        private readonly AgentDomainService $agentDomainService,
        private readonly TopicDomainService $topicDomainService,
        private readonly TaskDomainService $taskDomainService,
        private readonly WorkspaceExporterInterface $workspaceExporter,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get('slides-template');
    }

    private LoggerInterface $logger;

    public function publishFromProjectWorkspace(
        MagicUserAuthorization $authorization,
        SlidesTemplateDataIsolation $dataIsolation,
        int $projectId,
        int $directoryId,
        ?string $requestedCode,
        string $exportId,
    ): array {
        $startedAt = microtime(true);
        $sandboxId = null;
        $response = null;
        $code = trim((string) $requestedCode);
        try {
            $this->logger->info('Slides template project export started', [
                'project_id' => $projectId,
                'directory_id' => $directoryId,
                'requested_code' => $code,
                'organization_code' => $dataIsolation->getCurrentOrganizationCode(),
                'user_id' => $dataIsolation->getCurrentUserId(),
            ]);

            $project = $this->getAccessibleProjectWithManager($projectId, $authorization->getId(), $authorization->getOrganizationCode());
            $directory = $this->assertTemplateDirectory($projectId, $directoryId);
            $sourcePath = $this->resolveSourcePath($project, $directory);
            if ($code === '') {
                $code = basename($sourcePath);
                if ($code === '') {
                    throw new RuntimeException('Template code is required when the directory name is unavailable.');
                }
            }

            $sandboxId = $this->resolveExportTarget($dataIsolation, $project);
            $this->logger->info('Slides template export target resolved', [
                'project_id' => $projectId,
                'directory_id' => $directoryId,
                'code' => $code,
                'sandbox_id' => $sandboxId,
                'mode' => config('super-magic.sandbox.enabled', true) ? 'sandbox' : 'local-direct',
            ]);

            $exportDirectory = 'slide-templates/' . $code . '/' . $exportId;
            $privateConfig = $this->cloudFileRepository->getStsTemporaryCredential(
                $dataIsolation->getCurrentOrganizationCode(),
                StorageBucketType::Private,
                $exportDirectory,
                options: ['internal_endpoint' => true]
            );
            $publicConfig = $this->cloudFileRepository->getStsTemporaryCredential(
                $dataIsolation->getCurrentOrganizationCode(),
                StorageBucketType::Public,
                $exportDirectory,
                options: ['internal_endpoint' => true]
            );
            $directoryName = $this->sanitizeFileName($directory->getFileName(), $code);
            $request = new ExportWorkspaceRequest(
                self::EXPORT_TYPE,
                $code,
                $privateConfig,
                $sourcePath,
                $directoryName,
                $directoryName . '.zip',
                $publicConfig,
            );
            $response = $this->workspaceExporter->export(
                ContactDataIsolation::create($dataIsolation->getCurrentOrganizationCode(), $dataIsolation->getCurrentUserId()),
                $sandboxId,
                $request,
            );
            if (! $response->isSuccess()) {
                throw new RuntimeException('Slides template Sandbox export failed: ' . $response->getMessage());
            }

            $result = SlidesTemplateProjectExportResult::fromSandbox(
                $response->getFileKey(),
                $response->getMetadata(),
                $projectId,
                $directoryId,
            );
            $payload = $result->toArray();
            if ($payload['code'] !== '' && $payload['code'] !== $code) {
                throw new RuntimeException('Sandbox export code does not match requested code.');
            }
            $payload['code'] = $code;
            $this->logger->info('Slides template project export completed', [
                'project_id' => $projectId,
                'directory_id' => $directoryId,
                'sandbox_id' => $sandboxId,
                'code' => $code,
                'template_file_key' => $payload['template_file_key'],
                'preview_image_count' => count($payload['preview_image_file_keys']),
                'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000),
            ]);
            return $payload;
        } catch (\Throwable $throwable) {
            if ($response?->isSuccess()) {
                $this->cleanupExportedFiles(
                    $dataIsolation,
                    array_merge(
                        ['template_file_key' => $response->getFileKey()],
                        $response->getMetadata()
                    ),
                    $exportId,
                );
            }
            $this->logger->error('Slides template project export failed', [
                'project_id' => $projectId,
                'directory_id' => $directoryId,
                'sandbox_id' => $sandboxId,
                'requested_code' => $code,
                'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000),
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
            throw $throwable;
        }
    }

    /** @param array<string, mixed> $payload */
    public function cleanupExportedFiles(SlidesTemplateDataIsolation $dataIsolation, array $payload, string $exportId): void
    {
        $organizationCode = $dataIsolation->getCurrentOrganizationCode();
        $privateKeys = array_values(array_filter([(string) ($payload['template_file_key'] ?? '')]));
        $publicKeys = array_values(array_filter([
            (string) ($payload['thumbnail_file_key'] ?? ''),
            (string) ($payload['collage_file_key'] ?? ''),
            ...array_map('strval', $payload['preview_image_file_keys'] ?? []),
        ]));
        foreach ([
            [StorageBucketType::Private, $privateKeys],
            [StorageBucketType::Public, $publicKeys],
        ] as [$bucket, $keys]) {
            foreach (array_unique($keys) as $key) {
                if (! str_contains($key, '/' . $exportId . '/')) {
                    $this->logger->warning('Slides template export cleanup failed', [
                        'code' => $payload['code'] ?? null,
                        'bucket' => $bucket->value,
                        'file_key' => $key,
                        'message' => 'File key is outside the current export directory.',
                    ]);
                    continue;
                }
                try {
                    if (! $this->cloudFileRepository->deleteFile($organizationCode, $key, $bucket)) {
                        throw new RuntimeException('Storage delete returned false.');
                    }
                } catch (\Throwable $throwable) {
                    $this->logger->warning('Slides template export cleanup failed', [
                        'code' => $payload['code'] ?? null,
                        'bucket' => $bucket->value,
                        'file_key' => $key,
                        'exception' => $throwable::class,
                        'message' => $throwable->getMessage(),
                    ]);
                }
            }
        }
    }

    private function assertTemplateDirectory(int $projectId, int $directoryId): TaskFileEntity
    {
        $directory = $this->taskFileDomainService->getFileEntityById($directoryId);
        if ($directory->getProjectId() !== $projectId || ! $directory->getIsDirectory() || $directory->getStorageType() !== StorageType::WORKSPACE) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_DIRECTORY_INVALID);
        }
        return $directory;
    }

    private function resolveSourcePath(ProjectEntity $project, TaskFileEntity $directory): string
    {
        $fileKey = trim(str_replace('\\', '/', $directory->getFileKey()), '/');
        $workDir = trim(str_replace('\\', '/', $project->getWorkDir()), '/');
        if ($workDir !== '' && ($fileKey === $workDir || str_starts_with($fileKey, $workDir . '/'))) {
            $path = trim(WorkDirectoryUtil::getRelativeFilePath($fileKey, $workDir), '/');
            if ($path !== '') {
                return $path;
            }
        }

        $allFiles = $this->taskFileDomainService->getFilesWithParentsByIds([$directory->getFileId()], $project->getId());
        $fileMap = RelativeFilePathUtil::indexByFileId($allFiles);
        $path = trim(str_replace('\\', '/', RelativeFilePathUtil::buildPathByParentChain($directory, $fileMap)), '/');
        if ($path === '') {
            throw new RuntimeException('Unable to resolve Sandbox source path.');
        }

        $this->logger->debug('Slides template export source path resolved from file parent chain', [
            'project_id' => $project->getId(),
            'directory_id' => $directory->getFileId(),
            'directory_file_key' => $directory->getFileKey(),
            'project_work_dir' => $project->getWorkDir(),
            'source_path' => $path,
        ]);
        return $path;
    }

    private function resolveExportTarget(SlidesTemplateDataIsolation $dataIsolation, ProjectEntity $project): string
    {
        if (! config('super-magic.sandbox.enabled', true)) {
            $this->logger->info('Slides template export using local Super Magic service', [
                'project_id' => $project->getId(),
            ]);
            return '';
        }

        $topicId = $project->getCurrentTopicId();
        if (empty($topicId)) {
            throw new RuntimeException('Project topic is required for Sandbox export.');
        }
        $topic = $this->topicDomainService->getTopicById($topicId);
        if ($topic === null || $topic->getProjectId() !== $project->getId()) {
            throw new RuntimeException('Project topic is invalid for Sandbox export.');
        }
        $sandboxId = (string) $topic->getSandboxId();
        if ($sandboxId === (string) $topic->getId()) {
            $sandboxId = '';
        }

        $topic->setSandboxId($sandboxId);
        $contactIsolation = ContactDataIsolation::create($dataIsolation->getCurrentOrganizationCode(), $dataIsolation->getCurrentUserId());
        $task = $this->taskDomainService->initDefaultTask($contactIsolation, $topic, self::EXPORT_PROMPT);
        $context = $this->agentDomainService->buildInitAgentContext($contactIsolation, $project, $topic, $task, $sandboxId, true);
        $sandboxId = $this->agentDomainService->ensureSandboxInitialized($contactIsolation, $context);
        $this->topicDomainService->updateTopicStatusAndSandboxId($topic->getId(), $task->getId(), TaskStatus::FINISHED, $sandboxId);
        $this->taskDomainService->updateTaskStatus(TaskStatus::FINISHED, $task->getId(), (string) $task->getId(), $sandboxId);
        return $sandboxId;
    }

    private function sanitizeFileName(string $fileName, string $fallback): string
    {
        $fileName = trim($fileName, '/');
        if ($fileName === '' || $fileName === '.' || $fileName === '..' || str_contains($fileName, '/')) {
            return $fallback;
        }
        return $fileName;
    }
}
