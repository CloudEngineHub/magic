<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\Command;

use App\Application\SuperMagic\Agent\Service\AgentZipGeneratorService;
use App\Domain\File\Service\FileDomainService;
use App\Domain\SuperMagic\Agent\Entity\SuperMagicAgentEntity;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use App\Domain\SuperMagic\Agent\Service\SuperMagicAgentDomainService;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
use App\Domain\SuperMagic\Project\Service\ProjectDomainService;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use App\Infrastructure\SuperMagic\Utils\FrontmatterParser;
use Hyperf\Codec\Json;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use SplFileInfo;
use Symfony\Component\Console\Input\InputOption;
use Throwable;
use ZipArchive;

/**
 * Export agents for cross-environment migration.
 *
 * For each source user defined in the mapping file, all agents created by that
 * user are exported as individual ZIP archives into the output directory.
 *
 * Export strategy (in priority order):
 *   1. Read files from the agent's project .magic/ directory in the task-file tree,
 *      downloading actual content from the SandBox object-storage bucket.
 *      If IDENTITY.md is absent in .magic/, it is generated from entity fields.
 *   2. Fall back to generating a minimal ZIP purely from entity metadata when
 *      the agent has no bound project, or the project has no .magic/ directory.
 *
 * Output layout:
 *   {output}/
 *   └── {source_user_id}/
 *       ├── agents_meta.json
 *       ├── {agent_code}.zip
 *       └── ...
 *
 * Usage:
 *   php bin/hyperf.php super-magic:export-agents-for-migration \
 *     --mapping=/data/migration_mapping.json \
 *     --output=/data/agent_exports
 */
#[Command]
class ExportAgentsForMigrationCommand extends HyperfCommand
{
    protected ?string $name = 'super-magic:export-agents-for-migration';

    protected LoggerInterface $logger;

    public function __construct(
        protected SuperMagicAgentDomainService $superMagicAgentDomainService,
        protected ProjectDomainService $projectDomainService,
        protected TaskFileDomainService $taskFileDomainService,
        protected FileDomainService $fileDomainService,
        protected AgentZipGeneratorService $agentZipGeneratorService,
        LoggerFactory $loggerFactory
    ) {
        $this->logger = $loggerFactory->get('export-agents-migration');
        parent::__construct();
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('Export agents from the current environment for cross-environment migration');
        $this->addOption('mapping', null, InputOption::VALUE_REQUIRED, 'Path to the user-mapping JSON file');
        $this->addOption('output', null, InputOption::VALUE_REQUIRED, 'Directory where exported ZIP files will be saved');
    }

    public function handle(): void
    {
        $mappingPath = (string) $this->input->getOption('mapping');
        $outputDir = rtrim((string) $this->input->getOption('output'), '/\\');

        if ($mappingPath === '' || $outputDir === '') {
            $this->error('Both --mapping and --output options are required.');
            return;
        }

        $mapping = $this->loadMapping($mappingPath);
        if ($mapping === null) {
            return;
        }

        if (! is_dir($outputDir) && ! mkdir($outputDir, 0755, true) && ! is_dir($outputDir)) {
            $this->error("Cannot create output directory: {$outputDir}");
            return;
        }

        $totalSuccess = 0;
        $totalFail = 0;
        $totalSkip = 0;

        foreach ($mapping as $entry) {
            $sourceUserId = (string) ($entry['source_user_id'] ?? '');
            $sourceOrgCode = (string) ($entry['source_org_code'] ?? '');

            if ($sourceUserId === '' || $sourceOrgCode === '') {
                $this->warn('Skipping entry with missing source_user_id or source_org_code.');
                ++$totalSkip;
                continue;
            }

            $this->line('');
            $this->line("==> Exporting agents for user: {$sourceUserId} (org: {$sourceOrgCode})");

            [$success, $fail, $skip] = $this->exportUserAgents($sourceUserId, $sourceOrgCode, $outputDir);
            $totalSuccess += $success;
            $totalFail += $fail;
            $totalSkip += $skip;
        }

        $this->line('');
        $this->line(sprintf(
            'Export complete. Success: %d, Failed: %d, Skipped: %d',
            $totalSuccess,
            $totalFail,
            $totalSkip
        ));
    }

    /**
     * Export all agents for a single source user.
     *
     * @return array{0: int, 1: int, 2: int} [success, fail, skip]
     */
    private function exportUserAgents(string $userId, string $orgCode, string $outputDir): array
    {
        $userOutputDir = $outputDir . '/' . $userId;
        if (! is_dir($userOutputDir) && ! mkdir($userOutputDir, 0755, true) && ! is_dir($userOutputDir)) {
            $this->error("Cannot create user output directory: {$userOutputDir}");
            return [0, 1, 0];
        }

        $dataIsolation = SuperMagicAgentDataIsolation::create($orgCode, $userId);
        $agentCodes = $this->superMagicAgentDomainService->getCodesByCreator($dataIsolation, $userId);

        if (empty($agentCodes)) {
            $this->line("  No agents found for user {$userId}.");
            return [0, 0, 0];
        }

        $this->line(sprintf('  Found %d agent(s). Starting export...', count($agentCodes)));

        /** @var array<string, SuperMagicAgentEntity> $agents */
        $agents = $this->superMagicAgentDomainService->findByCodes($dataIsolation, $agentCodes);

        $metaList = [];
        $success = 0;
        $fail = 0;
        $skip = 0;

        foreach ($agents as $code => $agent) {
            $this->line(sprintf('  → Agent code=%s name=%s', $code, $agent->getName()));

            try {
                [$zipPath, $source] = $this->buildAgentZip($agent);

                $destZipPath = $userOutputDir . '/' . $code . '.zip';
                if (! rename($zipPath, $destZipPath)) {
                    copy($zipPath, $destZipPath);
                    @unlink($zipPath);
                }

                $metaList[] = [
                    'code' => $code,
                    'name' => $agent->getName(),
                    'source' => $source,
                ];

                ++$success;
                $this->line(sprintf(
                    '    Exported to %s (source: %s)',
                    $destZipPath,
                    $source
                ));
            } catch (RuntimeException $runtimeException) {
                // RuntimeException from buildAgentZip means no exportable data — skip silently.
                ++$skip;
                $this->warn(sprintf('    Skipped: %s', $runtimeException->getMessage()));
                $this->logger->warning('Agent skipped during export', [
                    'code' => $code,
                    'user_id' => $userId,
                    'org_code' => $orgCode,
                    'reason' => $runtimeException->getMessage(),
                ]);
            } catch (Throwable $throwable) {
                ++$fail;
                $this->error(sprintf('    Export failed for code=%s: %s', $code, $throwable->getMessage()));
                $this->logger->error('Agent export failed', [
                    'code' => $code,
                    'user_id' => $userId,
                    'org_code' => $orgCode,
                    'error' => $throwable->getMessage(),
                    'trace' => $throwable->getTraceAsString(),
                ]);
            }
        }

        file_put_contents(
            $userOutputDir . '/agents_meta.json',
            Json::encode($metaList, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );

        return [$success, $fail, $skip];
    }

    /**
     * Build the agent ZIP from its project .magic/ task-file tree.
     *
     * Throws a RuntimeException (which the caller catches and counts as a skip)
     * when the agent has no bound project or the project has no .magic/ directory.
     *
     * @return array{0: string, 1: string} [local zip path, source description]
     * @throws RuntimeException when no exportable data is available
     */
    private function buildAgentZip(SuperMagicAgentEntity $agent): array
    {
        $projectId = $agent->getProjectId();

        if (empty($projectId)) {
            $this->logger->info('Agent has no bound project, generating ZIP from entity fields', [
                'agent_code' => $agent->getCode(),
            ]);
            $zipPath = $this->agentZipGeneratorService->generateFromEntity($agent, $agent->getCode());
            return [$zipPath, 'entity_fields'];
        }

        $project = $this->projectDomainService->getProjectNotUserId((int) $projectId);
        if ($project === null) {
            $this->logger->info('Agent project not found, generating ZIP from entity fields', [
                'agent_code' => $agent->getCode(),
                'project_id' => $projectId,
            ]);
            $zipPath = $this->agentZipGeneratorService->generateFromEntity($agent, $agent->getCode());
            return [$zipPath, 'entity_fields'];
        }

        $magicDir = $this->taskFileDomainService->findDirectoryByPath((int) $projectId, '.magic');
        if ($magicDir === null) {
            // No .magic/ directory in the workspace — fall back to generating a minimal
            // ZIP from entity fields so the agent can still be imported on the target env.
            $this->logger->info('No .magic/ directory found, generating ZIP from entity fields', [
                'agent_code' => $agent->getCode(),
                'project_id' => $projectId,
            ]);
            $zipPath = $this->agentZipGeneratorService->generateFromEntity($agent, $agent->getCode());
            return [$zipPath, 'entity_fields'];
        }

        $zipPath = $this->buildZipFromTaskFiles(
            $agent,
            (int) $projectId,
            $project->getUserOrganizationCode(),
            $magicDir
        );

        return [$zipPath, 'task_files'];
    }

    /**
     * Build a ZIP from the .magic/ directory in the agent's project task-file tree.
     *
     * Steps:
     *   1. Recursively collect all files under the .magic/ directory.
     *   2. Download each file's content from the SandBox bucket via signed URL.
     *   3. Ensure IDENTITY.md is present; generate from entity fields if absent.
     *   4. Package everything into a ZIP with the structure: {agent_name}/{file}.
     */
    private function buildZipFromTaskFiles(
        SuperMagicAgentEntity $agent,
        int $projectId,
        string $projectOrgCode,
        TaskFileEntity $magicDirEntity
    ): string {
        // Always use the agent code as the top-level directory name inside the ZIP.
        // This guarantees consistent naming across all exports regardless of whether
        // the agent has a human-readable name.  The real agent name is read from
        // IDENTITY.md frontmatter by the importer, so the directory name is cosmetic.
        $agentDirName = $agent->getCode();

        $tempDir = sys_get_temp_dir() . '/agent_export_tf_' . uniqid('', true);
        $agentLocalDir = $tempDir . '/' . $agentDirName;

        if (! mkdir($agentLocalDir, 0755, true) && ! is_dir($agentLocalDir)) {
            throw new RuntimeException("Failed to create temp dir: {$agentLocalDir}");
        }

        try {
            // Collect all file entries under .magic/ recursively
            $fileEntries = $this->collectAllFiles($projectId, $magicDirEntity->getFileId());

            // Gather all file keys for batch signed-URL resolution
            $fileKeys = array_keys($fileEntries);
            $signedUrls = empty($fileKeys)
                ? []
                : $this->fileDomainService->getLinks($projectOrgCode, $fileKeys, StorageBucketType::SandBox);

            $hasIdentityMd = false;

            foreach ($fileEntries as $fileKey => $relPath) {
                // Each file is downloaded independently; any failure is logged and skipped
                // so that a single inaccessible file does not abort the entire ZIP creation.
                try {
                    $localPath = $agentLocalDir . '/' . $relPath;
                    $localPathDir = dirname($localPath);

                    if (! is_dir($localPathDir) && ! mkdir($localPathDir, 0755, true) && ! is_dir($localPathDir)) {
                        $this->logger->warning('Failed to create subdir, skipping file', [
                            'subdir' => $localPathDir,
                            'rel_path' => $relPath,
                        ]);
                        continue;
                    }

                    $fileLink = $signedUrls[$fileKey] ?? null;
                    if ($fileLink === null || empty($fileLink->getUrl())) {
                        $this->logger->warning('No signed URL for task file, skipping', [
                            'file_key' => $fileKey,
                            'rel_path' => $relPath,
                        ]);
                        continue;
                    }

                    // Use stream context with a short timeout; Hyperf's ErrorExceptionHandler
                    // may convert file_get_contents errors into exceptions, so we wrap the
                    // entire download in try-catch rather than relying on the @ operator.
                    $ctx = stream_context_create(['http' => ['timeout' => 30]]);
                    $content = file_get_contents($fileLink->getUrl(), false, $ctx);
                    if ($content === false) {
                        $this->logger->warning('Failed to download task file content, skipping', [
                            'file_key' => $fileKey,
                            'rel_path' => $relPath,
                        ]);
                        continue;
                    }

                    file_put_contents($localPath, $content);

                    if ($relPath === 'IDENTITY.md') {
                        // Validate that the downloaded IDENTITY.md has a non-empty name.
                        // If the workspace file was never properly populated (e.g. only 8 bytes),
                        // fall through so that writeIdentityMdToDir regenerates it from entity fields.
                        $hasIdentityMd = $this->isIdentityMdValid($content);
                        if (! $hasIdentityMd) {
                            $this->logger->warning('Downloaded IDENTITY.md has no valid name field, will regenerate from entity', [
                                'agent_code' => $agent->getCode(),
                                'file_size' => strlen($content),
                            ]);
                        }
                    }
                } catch (Throwable $downloadException) {
                    // A single file download failure must not abort ZIP creation.
                    $this->logger->warning('Exception while downloading task file, skipping', [
                        'file_key' => $fileKey,
                        'rel_path' => $relPath,
                        'error' => $downloadException->getMessage(),
                    ]);
                }
            }

            // Generate IDENTITY.md from entity if absent in .magic/
            if (! $hasIdentityMd) {
                $this->logger->info('IDENTITY.md not found in .magic/, generating from entity fields', [
                    'agent_code' => $agent->getCode(),
                ]);
                $this->agentZipGeneratorService->writeIdentityMdToDir($agentLocalDir, $agent);
            }

            // Package into ZIP.
            // Use an ASCII-only filename for the ZIP itself to avoid potential issues
            // with libzip writing files whose names contain multibyte characters on
            // certain platform / libzip version combinations.
            $zipPath = $tempDir . '/export.zip';
            $this->createZip($agentLocalDir, $zipPath, $agentDirName);

            if (! file_exists($zipPath)) {
                throw new RuntimeException(
                    "ZipArchive::close() silently failed — ZIP file was not written to {$zipPath}"
                );
            }

            return $zipPath;
        } finally {
            $this->removeDirectory($agentLocalDir);
        }
    }

    /**
     * Recursively collect all non-directory files under a task-file directory.
     *
     * @return array<string, string> Map of fileKey → relative path from .magic/ root
     */
    private function collectAllFiles(int $projectId, int $parentId, string $prefix = ''): array
    {
        $result = [];
        $children = $this->taskFileDomainService->getChildrenByParentAndProject($projectId, $parentId);

        foreach ($children as $child) {
            /** @var TaskFileEntity $child */
            $relativePath = $prefix !== '' ? $prefix . '/' . $child->getFileName() : $child->getFileName();

            if ($child->getIsDirectory()) {
                $result = array_merge($result, $this->collectAllFiles($projectId, $child->getFileId(), $relativePath));
            } else {
                $fileKey = $child->getFileKey();
                if ($fileKey !== '') {
                    $result[$fileKey] = $relativePath;
                }
            }
        }

        return $result;
    }

    /**
     * Package the contents of $agentDir into a ZIP file at $zipPath.
     * All entries are stored under the top-level directory $agentDirName.
     */
    private function createZip(string $agentDir, string $zipPath, string $agentDirName): void
    {
        // Diagnostic: log the directory state before zipping.
        $dirContents = is_dir($agentDir) ? (scandir($agentDir) ?: []) : [];
        $this->logger->info('[createZip] start', [
            'agent_dir' => $agentDir,
            'agent_dir_exists' => is_dir($agentDir),
            'zip_path' => $zipPath,
            'agent_dir_name' => $agentDirName,
            'dir_contents' => array_values(array_diff($dirContents, ['.', '..'])),
        ]);

        $zip = new ZipArchive();
        $result = $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        if ($result !== true) {
            throw new RuntimeException("Failed to create ZIP at {$zipPath} (code: {$result})");
        }

        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($agentDir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        $entryCount = 0;
        foreach ($files as $file) {
            /** @var SplFileInfo $file */
            $realPath = $file->getRealPath();
            if ($realPath === false) {
                continue;
            }
            // On macOS, sys_get_temp_dir() returns the symlink path (/var/folders/...)
            // while getRealPath() returns the resolved path (/private/var/folders/...).
            // Use the realpath of $agentDir as the strip prefix to avoid mismatch.
            $agentDirReal = realpath($agentDir) ?: $agentDir;
            $relativePath = $agentDirName . '/' . substr($realPath, strlen($agentDirReal) + 1);
            $relativePath = str_replace('\\', '/', $relativePath);

            $this->logger->info('[createZip] entry', [
                'real_path' => $realPath,
                'relative_path' => $relativePath,
                'is_dir' => $file->isDir(),
                'agent_dir_real' => $agentDirReal,
            ]);

            if ($file->isDir()) {
                $zip->addEmptyDir($relativePath, ZipArchive::FL_ENC_UTF_8);
            } else {
                $zip->addFile($realPath, $relativePath, 0, 0, ZipArchive::FL_ENC_UTF_8);
            }
            ++$entryCount;
        }

        $this->logger->info('[createZip] before close', [
            'entry_count' => $entryCount,
            'zip_path' => $zipPath,
        ]);

        // close() returns false on failure; when it fails, libzip discards the output
        // file (zip_discard), so the file on disk will not exist.
        $closeResult = $zip->close();
        $this->logger->info('[createZip] after close', [
            'close_result' => $closeResult,
            'file_exists' => file_exists($zipPath),
            'entry_count' => $entryCount,
        ]);

        if (! $closeResult) {
            throw new RuntimeException("ZipArchive::close() failed for {$zipPath}. Status: {$zip->status}, comment: {$zip->getStatusString()}");
        }
    }

    /**
     * Recursively remove a local directory.
     */
    private function removeDirectory(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }

        $items = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($items as $item) {
            /** @var SplFileInfo $item */
            if ($item->isDir()) {
                @rmdir((string) $item->getRealPath());
            } else {
                @unlink((string) $item->getRealPath());
            }
        }

        @rmdir($dir);
    }

    /**
     * Load and validate the mapping JSON file.
     *
     * @return null|array<int, array<string, string>>
     */
    private function loadMapping(string $mappingPath): ?array
    {
        if (! file_exists($mappingPath)) {
            $this->error("Mapping file not found: {$mappingPath}");
            return null;
        }

        $rawContent = file_get_contents($mappingPath);
        if ($rawContent === false) {
            $this->error("Cannot read mapping file: {$mappingPath}");
            return null;
        }

        try {
            $mapping = Json::decode($rawContent);
        } catch (Throwable $e) {
            $this->error("Invalid JSON in mapping file: {$e->getMessage()}");
            return null;
        }

        if (! is_array($mapping) || empty($mapping)) {
            $this->error('Mapping file must contain a non-empty JSON array.');
            return null;
        }

        return $mapping;
    }

    /**
     * Check whether downloaded IDENTITY.md content is valid (has a non-empty name field).
     */
    private function isIdentityMdValid(string $content): bool
    {
        if (trim($content) === '') {
            return false;
        }
        try {
            $parsed = FrontmatterParser::parse($content);
            $name = trim((string) ($parsed['name'] ?? ''));
            return $name !== '';
        } catch (Throwable) {
            return false;
        }
    }
}
