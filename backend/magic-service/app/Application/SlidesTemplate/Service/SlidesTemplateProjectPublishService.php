<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Service;

use App\Application\SuperMagic\Common\Service\AbstractAppService;
use App\Domain\File\Service\FileDomainService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SuperMagic\Common\Entity\ValueObject\StorageType;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use App\Infrastructure\Util\ZipUtil;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Dtyq\CloudFile\Kernel\Struct\UploadFile;
use RuntimeException;
use Throwable;

class SlidesTemplateProjectPublishService extends AbstractAppService
{
    private const string MANIFEST_FILE_NAME = 'template-assets.json';

    private const string TEMP_DIR_BASE = '/tmp/magic_slides_template_publish/';

    private const array EXCLUDED_ZIP_PREFIXES = ['previews/', 'previews', '.template-work/', '.template-work'];

    private const int MAX_FILE_COUNT = 100;

    private const int MAX_DIRECTORY_SIZE_BYTES = 20 * 1024 * 1024;

    private const int MAX_PREVIEW_IMAGE_COUNT = 50;

    /** @var array<int, int> */
    private array $downloadedFileSizes = [];

    public function __construct(
        private readonly TaskFileDomainService $taskFileDomainService,
        private readonly FileDomainService $fileDomainService,
    ) {
    }

    /**
     * @return array{
     *     code: string,
     *     category_code: null|string,
     *     label: array,
     *     description: array,
     *     thumbnail_file_key: string,
     *     collage_file_key: null|string,
     *     preview_image_file_keys: array<int, string>,
     *     template_file_key: string,
     *     tag_codes: array<int, string>,
     *     project_id: int,
     *     project_directory_id: int
     * }
     */
    public function publishFromProjectWorkspace(
        MagicUserAuthorization $authorization,
        SlidesTemplateDataIsolation $dataIsolation,
        int $projectId,
        int $directoryId,
        ?string $requestedCode,
    ): array {
        $project = $this->getAccessibleProjectWithManager(
            $projectId,
            $authorization->getId(),
            $authorization->getOrganizationCode()
        );
        $directory = $this->assertTemplateDirectory($projectId, $directoryId);
        $this->assertDirectoryFileLimits(
            $this->taskFileDomainService->findFilesRecursivelyByParentId($projectId, $directory->getFileId())
        );
        $manifest = $this->readManifest($project, $directory);
        $code = $this->resolveTemplateCode($requestedCode, $manifest);
        $relativePathMap = $this->buildRelativePathMap($projectId, $directory);
        $this->downloadedFileSizes = [];

        $tempBaseDir = self::TEMP_DIR_BASE . 'publish_' . IdGenerator::getUniqueId32();
        if (! is_dir($tempBaseDir) && ! mkdir($tempBaseDir, 0755, true) && ! is_dir($tempBaseDir)) {
            throw new RuntimeException('Failed to create temporary directory');
        }

        try {
            $organizationCode = $dataIsolation->getCurrentOrganizationCode();
            $thumbnailFileKey = $this->uploadWorkspaceRelativeFile(
                $project,
                $relativePathMap,
                (string) ($manifest['local_files']['thumbnail'] ?? ''),
                $organizationCode,
                $code,
                StorageBucketType::Public,
                $tempBaseDir
            );
            $collageRelativePath = (string) ($manifest['local_files']['collage'] ?? '');
            $collageFileKey = $collageRelativePath === ''
                ? null
                : $this->uploadWorkspaceRelativeFile(
                    $project,
                    $relativePathMap,
                    $collageRelativePath,
                    $organizationCode,
                    $code,
                    StorageBucketType::Public,
                    $tempBaseDir
                );
            $previewImageFileKeys = [];
            foreach ($manifest['local_files']['preview_images'] ?? [] as $previewRelativePath) {
                if (! is_string($previewRelativePath) || trim($previewRelativePath) === '') {
                    continue;
                }
                $previewImageFileKeys[] = $this->uploadWorkspaceRelativeFile(
                    $project,
                    $relativePathMap,
                    $previewRelativePath,
                    $organizationCode,
                    $code,
                    StorageBucketType::Public,
                    $tempBaseDir
                );
            }
            $templateFileKey = $this->packageAndUploadTemplateZip(
                $project,
                $directory,
                $relativePathMap,
                $organizationCode,
                $code,
                $tempBaseDir
            );

            $backendFields = is_array($manifest['backend_fields'] ?? null) ? $manifest['backend_fields'] : [];

            return [
                'code' => $code,
                'category_code' => $this->resolveNullableString($manifest['category_code'] ?? ($backendFields['category_code'] ?? null)),
                'label' => $this->resolveRequiredI18n($backendFields['label'] ?? null),
                'description' => $this->resolveRequiredI18n($backendFields['description'] ?? null),
                'thumbnail_file_key' => $thumbnailFileKey,
                'collage_file_key' => $collageFileKey,
                'preview_image_file_keys' => $previewImageFileKeys,
                'template_file_key' => $templateFileKey,
                'tag_codes' => $this->resolveTagCodes($manifest['tag_codes'] ?? ($backendFields['tag_codes'] ?? [])),
                'project_id' => $projectId,
                'project_directory_id' => $directoryId,
            ];
        } finally {
            if (is_dir($tempBaseDir)) {
                ZipUtil::removeDirectory($tempBaseDir);
            }
        }
    }

    private function assertTemplateDirectory(int $projectId, int $directoryId): TaskFileEntity
    {
        $directory = $this->taskFileDomainService->getFileEntityById($directoryId);
        if ($directory->getProjectId() !== $projectId || ! $directory->getIsDirectory()) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_DIRECTORY_INVALID);
        }
        if ($directory->getStorageType() !== StorageType::WORKSPACE) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_DIRECTORY_INVALID);
        }

        return $directory;
    }

    /**
     * @param TaskFileEntity[] $files
     */
    private function assertDirectoryFileLimits(array $files): void
    {
        $fileCount = 0;
        $totalSize = 0;
        foreach ($files as $file) {
            if ($file->getIsDirectory()) {
                continue;
            }
            ++$fileCount;
            $totalSize += max(0, $file->getFileSize());
        }

        if ($fileCount > self::MAX_FILE_COUNT) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_TOO_MANY_FILES);
        }
        if ($totalSize > self::MAX_DIRECTORY_SIZE_BYTES) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_FILE_TOO_LARGE);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function readManifest(ProjectEntity $project, TaskFileEntity $directory): array
    {
        $manifestFile = null;
        $files = $this->taskFileDomainService->findFilesRecursivelyByParentId(
            $directory->getProjectId(),
            $directory->getFileId()
        );
        foreach ($files as $file) {
            if (! $file->getIsDirectory() && $file->getFileName() === self::MANIFEST_FILE_NAME) {
                $manifestFile = $file;
                break;
            }
        }
        if ($manifestFile === null) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_MANIFEST_NOT_FOUND);
        }

        $tempFile = tempnam(sys_get_temp_dir(), 'slides_template_manifest_');
        if ($tempFile === false) {
            throw new RuntimeException('Failed to create temporary manifest file');
        }

        try {
            $this->fileDomainService->downloadByChunks(
                $project->getUserOrganizationCode(),
                $manifestFile->getFileKey(),
                $tempFile,
                StorageBucketType::SandBox
            );
            $content = file_get_contents($tempFile);
            if ($content === false || trim($content) === '') {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_MANIFEST_INVALID);
            }
            $manifest = json_decode($content, true);
            if (! is_array($manifest)) {
                ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_MANIFEST_INVALID);
            }
            $this->assertManifestStructure($manifest);
            return $manifest;
        } finally {
            if (is_file($tempFile)) {
                unlink($tempFile);
            }
        }
    }

    /**
     * @param array<string, mixed> $manifest
     */
    private function assertManifestStructure(array $manifest): void
    {
        if (($manifest['schema_version'] ?? '') !== '1.0') {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_MANIFEST_INVALID);
        }
        if (! is_array($manifest['local_files'] ?? null)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_MANIFEST_INVALID);
        }
        if (! is_string($manifest['local_files']['thumbnail'] ?? null) || trim($manifest['local_files']['thumbnail']) === '') {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_MANIFEST_INVALID);
        }
        if (! is_array($manifest['backend_fields'] ?? null)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_MANIFEST_INVALID);
        }

        $previewImageCount = 0;
        foreach ($manifest['local_files']['preview_images'] ?? [] as $previewRelativePath) {
            if (is_string($previewRelativePath) && trim($previewRelativePath) !== '') {
                ++$previewImageCount;
            }
        }
        if ($previewImageCount > self::MAX_PREVIEW_IMAGE_COUNT) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_TOO_MANY_PREVIEW_IMAGES);
        }
    }

    /**
     * @param array<string, mixed> $manifest
     */
    private function resolveTemplateCode(?string $requestedCode, array $manifest): string
    {
        $requestedCode = trim((string) $requestedCode);
        if ($requestedCode !== '') {
            return $requestedCode;
        }

        $backendFields = is_array($manifest['backend_fields'] ?? null) ? $manifest['backend_fields'] : [];
        foreach ([$backendFields['code'] ?? null, $manifest['template_id'] ?? null] as $candidate) {
            $candidate = trim((string) $candidate);
            if ($candidate !== '') {
                return $candidate;
            }
        }

        ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_MANIFEST_INVALID);
    }

    /**
     * @return array<string, TaskFileEntity>
     */
    private function buildRelativePathMap(int $projectId, TaskFileEntity $directory): array
    {
        $fileIdMap = [$directory->getFileId() => $directory];
        $files = $this->taskFileDomainService->findFilesRecursivelyByParentId($projectId, $directory->getFileId());
        foreach ($files as $file) {
            $fileIdMap[$file->getFileId()] = $file;
        }

        $relativePathMap = [];
        foreach ($files as $file) {
            if ($file->getIsDirectory()) {
                continue;
            }
            $relativePath = $this->buildRelativePath($file, $directory->getFileId(), $fileIdMap);
            if ($relativePath === '') {
                continue;
            }
            $relativePathMap[$this->normalizeRelativePath($relativePath)] = $file;
        }

        return $relativePathMap;
    }

    /**
     * @param array<int, TaskFileEntity> $fileIdMap
     */
    private function buildRelativePath(TaskFileEntity $file, int $rootDirectoryId, array $fileIdMap): string
    {
        $segments = [];
        $current = $file;
        $visited = [];

        while ($current !== null && $current->getFileId() !== $rootDirectoryId) {
            $id = $current->getFileId();
            if (isset($visited[$id])) {
                break;
            }
            $visited[$id] = true;

            $name = $current->getFileName();
            if ($name !== '' && $name !== '/') {
                $segments[] = $name;
            }

            $parentId = $current->getParentId();
            $current = $parentId !== null ? ($fileIdMap[$parentId] ?? null) : null;
        }

        return implode('/', array_reverse($segments));
    }

    /**
     * @param array<string, TaskFileEntity> $relativePathMap
     */
    private function uploadWorkspaceRelativeFile(
        ProjectEntity $project,
        array $relativePathMap,
        string $relativePath,
        string $organizationCode,
        string $templateCode,
        StorageBucketType $bucketType,
        string $tempBaseDir,
    ): string {
        $normalizedPath = $this->normalizeRelativePath($relativePath);
        $file = $relativePathMap[$normalizedPath] ?? null;
        if ($file === null) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_ASSET_NOT_FOUND);
        }

        $localFilePath = $tempBaseDir . '/assets/' . $normalizedPath;
        $localDir = dirname($localFilePath);
        if (! is_dir($localDir) && ! mkdir($localDir, 0755, true) && ! is_dir($localDir)) {
            throw new RuntimeException('Failed to create temporary asset directory');
        }

        $this->fileDomainService->downloadByChunks(
            $project->getUserOrganizationCode(),
            $file->getFileKey(),
            $localFilePath,
            StorageBucketType::SandBox
        );
        $this->recordDownloadedFile($file, $localFilePath);

        $storageRelativePath = $this->resolvePublicAssetStoragePath($normalizedPath);
        $targetDir = $this->buildStorageDir($organizationCode, $bucketType, $templateCode);
        $parentDir = dirname($storageRelativePath);
        if ($parentDir !== '.' && $parentDir !== '') {
            $targetDir .= '/' . $parentDir;
        }

        return $this->uploadLocalFile(
            $organizationCode,
            $localFilePath,
            $targetDir,
            basename($storageRelativePath),
            $bucketType
        );
    }

    /**
     * @param array<string, TaskFileEntity> $relativePathMap
     */
    private function packageAndUploadTemplateZip(
        ProjectEntity $project,
        TaskFileEntity $directory,
        array $relativePathMap,
        string $organizationCode,
        string $templateCode,
        string $tempBaseDir,
    ): string {
        $packageRootName = $this->sanitizeDirectoryName($directory->getFileName());
        $packageContentDir = $tempBaseDir . '/package/' . $packageRootName;
        if (! is_dir($packageContentDir) && ! mkdir($packageContentDir, 0755, true) && ! is_dir($packageContentDir)) {
            throw new RuntimeException('Failed to create temporary package directory');
        }

        foreach ($relativePathMap as $relativePath => $file) {
            if ($this->shouldExcludeFromZip($relativePath)) {
                continue;
            }

            $localFilePath = $packageContentDir . '/' . $relativePath;
            $localDir = dirname($localFilePath);
            if (! is_dir($localDir) && ! mkdir($localDir, 0755, true) && ! is_dir($localDir)) {
                throw new RuntimeException('Failed to create temporary package file directory');
            }

            $this->fileDomainService->downloadByChunks(
                $project->getUserOrganizationCode(),
                $file->getFileKey(),
                $localFilePath,
                StorageBucketType::SandBox
            );
            $this->recordDownloadedFile($file, $localFilePath);
        }

        $zipFilePath = $tempBaseDir . '/package/' . $packageRootName . '.zip';
        ZipUtil::compress($packageContentDir, $zipFilePath, $packageRootName);

        return $this->uploadLocalFile(
            $organizationCode,
            $zipFilePath,
            $this->buildStorageDir($organizationCode, StorageBucketType::Private, $templateCode),
            $packageRootName . '.zip',
            StorageBucketType::Private
        );
    }

    private function shouldExcludeFromZip(string $relativePath): bool
    {
        $normalizedPath = $this->normalizeRelativePath($relativePath);
        foreach (self::EXCLUDED_ZIP_PREFIXES as $prefix) {
            if ($normalizedPath === rtrim($prefix, '/') || str_starts_with($normalizedPath, rtrim($prefix, '/') . '/')) {
                return true;
            }
        }

        return false;
    }

    private function buildStorageDir(string $organizationCode, StorageBucketType $bucketType, string $templateCode): string
    {
        $appId = (string) config('kk_brd_service.app_id', 'open');

        return sprintf(
            '%s/%s/%s/slide-templates/%s',
            $organizationCode,
            $appId,
            md5($bucketType->value),
            $templateCode
        );
    }

    private function resolvePublicAssetStoragePath(string $normalizedPath): string
    {
        if (str_starts_with($normalizedPath, 'previews/')) {
            return substr($normalizedPath, strlen('previews/'));
        }

        return $normalizedPath;
    }

    private function recordDownloadedFile(TaskFileEntity $file, string $localFilePath): void
    {
        $fileId = $file->getFileId();
        if (isset($this->downloadedFileSizes[$fileId])) {
            return;
        }

        if (! is_file($localFilePath)) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_ASSET_NOT_FOUND);
        }

        $size = filesize($localFilePath);
        if ($size === false) {
            throw new RuntimeException('Failed to read downloaded file size');
        }

        $this->downloadedFileSizes[$fileId] = $size;
        if (array_sum($this->downloadedFileSizes) > self::MAX_DIRECTORY_SIZE_BYTES) {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_FILE_TOO_LARGE);
        }
    }

    private function uploadLocalFile(
        string $organizationCode,
        string $localFilePath,
        string $fileDir,
        string $fileName,
        StorageBucketType $bucketType,
    ): string {
        $uploadFile = new UploadFile($localFilePath, $fileDir, $fileName, false);
        try {
            $this->fileDomainService->uploadByCredential($organizationCode, $uploadFile, $bucketType, false);
        } catch (Throwable $throwable) {
            throw new RuntimeException('Failed to upload slides template file: ' . $throwable->getMessage(), 0, $throwable);
        }

        return $uploadFile->getKey();
    }

    private function normalizeRelativePath(string $relativePath): string
    {
        $relativePath = str_replace('\\', '/', trim($relativePath));
        return ltrim($relativePath, './');
    }

    private function sanitizeDirectoryName(string $directoryName): string
    {
        $directoryName = trim($directoryName, '/');
        if ($directoryName === '' || $directoryName === '.') {
            return 'slide-template';
        }

        return $directoryName;
    }

    /**
     * @return array{zh_CN: string, en_US: string}
     */
    private function resolveRequiredI18n(mixed $value): array
    {
        if (! is_array($value)
            || ! is_string($value['zh_CN'] ?? null)
            || trim($value['zh_CN']) === ''
            || ! is_string($value['en_US'] ?? null)
            || trim($value['en_US']) === '') {
            ExceptionBuilder::throw(SlidesTemplateErrorCode::PROJECT_TEMPLATE_MANIFEST_INVALID);
        }

        return [
            'zh_CN' => trim($value['zh_CN']),
            'en_US' => trim($value['en_US']),
        ];
    }

    /**
     * @return array<int, string>
     */
    private function resolveTagCodes(mixed $tagCodes): array
    {
        if (! is_array($tagCodes)) {
            return [];
        }

        $result = [];
        foreach ($tagCodes as $tagCode) {
            if (! is_string($tagCode)) {
                continue;
            }
            $tagCode = trim($tagCode);
            if ($tagCode !== '') {
                $result[] = $tagCode;
            }
        }

        return array_values(array_unique($result));
    }

    private function resolveNullableString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $value = trim($value);

        return $value === '' ? null : $value;
    }
}
