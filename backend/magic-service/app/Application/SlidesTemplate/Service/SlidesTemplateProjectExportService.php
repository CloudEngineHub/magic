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
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
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
use Throwable;

final class SlidesTemplateProjectExportService extends AbstractAppService
{
    private const string EXPORT_DIRECTORY_PREFIX = 'slide-templates';

    private const string EXPORT_TYPE = 'slides_template_creator';

    private const string EXPORT_PROMPT = 'Slides Template Export Task';

    private LoggerInterface $logger;

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

            $exportDirectory = $this->buildExportDirectory($code, $exportId);
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
                $code,
                $response->getFileKey(),
                $response->getMetadata(),
                $projectId,
                $directoryId,
            );
            $payload = $result->toArray();
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
        } catch (Throwable $throwable) {
            if ($code !== '') {
                $this->cleanupExportDirectory($dataIsolation, $code, $exportId);
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
        $code = trim((string) ($payload['code'] ?? ''));
        if ($code === '') {
            $this->logger->warning('Slides template export cleanup skipped', [
                'export_id' => $exportId,
                'message' => 'Template code is empty.',
            ]);
            return;
        }

        $this->cleanupExportDirectory($dataIsolation, $code, $exportId);
    }

    public function cleanupPreviousTemplateDirectory(
        SlidesTemplateDataIsolation $dataIsolation,
        SlidesTemplateEntity $template,
        string $currentExportId,
    ): void {
        $code = $template->getCode();
        $previousExportId = $this->resolveExportId($template->getTemplateFileKey(), $code);
        if ($previousExportId === null || $previousExportId === $currentExportId) {
            return;
        }

        $this->cleanupExportDirectory($dataIsolation, $code, $previousExportId);
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

    private function cleanupExportDirectory(
        SlidesTemplateDataIsolation $dataIsolation,
        string $code,
        string $exportId,
    ): void {
        try {
            $directory = $this->buildExportDirectory($code, $exportId);
        } catch (Throwable $throwable) {
            $this->logger->warning('Slides template export directory cleanup skipped', [
                'code' => $code,
                'export_id' => $exportId,
                'message' => $throwable->getMessage(),
            ]);
            return;
        }

        foreach ([StorageBucketType::Private, StorageBucketType::Public] as $bucket) {
            $this->cleanupBucketDirectory($dataIsolation, $directory, $bucket);
        }
    }

    private function cleanupBucketDirectory(
        SlidesTemplateDataIsolation $dataIsolation,
        string $directory,
        StorageBucketType $bucket,
    ): void {
        $organizationCode = $dataIsolation->getCurrentOrganizationCode();
        $marker = null;
        try {
            $objectKeys = [];
            do {
                $options = ['max-keys' => 1000];
                if ($marker !== null) {
                    $options['marker'] = $marker;
                }
                $result = $this->cloudFileRepository->listObjectsByCredential(
                    $organizationCode,
                    $directory,
                    $bucket,
                    $options,
                );
                $objectKeys = array_merge($objectKeys, array_values(array_filter(array_map(
                    static fn (array $object): string => (string) ($object['key'] ?? ''),
                    $result['objects'] ?? [],
                ))));
                $marker = ($result['next_marker'] ?? null) ?: null;
            } while ($marker !== null);

            $objectKeys = array_values(array_unique($objectKeys));
            $deletedCount = 0;
            $errorCount = 0;
            foreach (array_chunk($objectKeys, 1000) as $objectKeyBatch) {
                $deleteResult = $this->cloudFileRepository->deleteObjectsByCredential(
                    $directory,
                    $organizationCode,
                    $objectKeyBatch,
                    $bucket,
                    ['internal_endpoint' => true],
                );
                $batchErrors = $deleteResult['errors'] ?? [];
                $deletedCount += count($deleteResult['deleted'] ?? []);
                $errorCount += count($batchErrors);
                if ($batchErrors !== []) {
                    $this->logger->warning('Slides template export directory cleanup partially failed', [
                        'directory' => $directory,
                        'bucket' => $bucket->value,
                        'deleted_count' => count($deleteResult['deleted'] ?? []),
                        'error_count' => count($batchErrors),
                    ]);
                }
            }

            $this->logger->info('Slides template export directory cleaned', [
                'directory' => $directory,
                'bucket' => $bucket->value,
                'scanned_count' => count($objectKeys),
                'deleted_count' => $deletedCount,
                'error_count' => $errorCount,
            ]);
        } catch (Throwable $throwable) {
            $this->logger->warning('Slides template export directory cleanup failed', [
                'directory' => $directory,
                'bucket' => $bucket->value,
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
        }
    }

    private function buildExportDirectory(string $code, string $exportId): string
    {
        $code = trim($code);
        if ($code === '' || str_contains($code, '/') || str_contains($code, '\\')) {
            throw new RuntimeException('Template code cannot be used as an export directory.');
        }
        if (preg_match('/^[a-f0-9]{24}$/', $exportId) !== 1) {
            throw new RuntimeException('Template export ID is invalid.');
        }
        return self::EXPORT_DIRECTORY_PREFIX . '/' . $code . '/' . $exportId;
    }

    private function resolveExportId(string $fileKey, string $code): ?string
    {
        $pattern = '#(?:^|/)' . preg_quote(self::EXPORT_DIRECTORY_PREFIX, '#')
            . '/' . preg_quote($code, '#') . '/([a-f0-9]{24})(?:/|$)#';
        return preg_match($pattern, $fileKey, $matches) === 1 ? $matches[1] : null;
    }
}
