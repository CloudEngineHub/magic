<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\Command;

use App\Application\SuperMagic\Agent\Service\ImportAgentAppService;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Infrastructure\Util\Context\RequestContext;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\Codec\Json;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Input\InputOption;
use Throwable;

/**
 * Import agents into the current environment for cross-environment migration.
 *
 * This command is the counterpart of ExportAgentsForMigrationCommand.
 * It reads agent ZIP files produced by the export command and imports them
 * under the target users defined in the mapping file.
 *
 * The import fully reuses ImportAgentAppService::import(), which handles:
 *   - Idempotent agent create-or-update (keyed on name + orgCode)
 *   - Project workspace rebuild (.magic/ directory)
 *   - Private-bucket ZIP upload
 *   - Auto-publish (organization-wide)
 *   - Resource visibility sync
 *
 * Each agent is processed independently; a failure for one agent does not
 * abort the entire migration run.
 *
 * Usage:
 *   php bin/hyperf.php super-magic:import-agents-for-migration \
 *     --mapping=/data/migration_mapping.json \
 *     --source=/data/agent_exports
 */
#[Command]
class ImportAgentsForMigrationCommand extends HyperfCommand
{
    protected ?string $name = 'super-magic:import-agents-for-migration';

    protected LoggerInterface $logger;

    public function __construct(
        protected ImportAgentAppService $importAgentAppService,
        protected MagicUserDomainService $magicUserDomainService,
        LoggerFactory $loggerFactory
    ) {
        $this->logger = $loggerFactory->get('import-agents-migration');
        parent::__construct();
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('Import agents into the current environment for cross-environment migration');
        $this->addOption('mapping', null, InputOption::VALUE_REQUIRED, 'Path to the user-mapping JSON file');
        $this->addOption('source', null, InputOption::VALUE_REQUIRED, 'Directory containing ZIP files exported by the export command');
    }

    public function handle(): void
    {
        $mappingPath = (string) $this->input->getOption('mapping');
        $sourceDir = rtrim((string) $this->input->getOption('source'), '/\\');

        if ($mappingPath === '' || $sourceDir === '') {
            $this->error('Both --mapping and --source options are required.');
            return;
        }

        $mapping = $this->loadMapping($mappingPath);
        if ($mapping === null) {
            return;
        }

        if (! is_dir($sourceDir)) {
            $this->error("Source directory does not exist: {$sourceDir}");
            return;
        }

        $totalSuccess = 0;
        $totalFail = 0;
        $totalSkip = 0;

        /** @var array<int, array{code: string, name: string, zip: string, status: string, reason: string}> $resultRows */
        $resultRows = [];

        foreach ($mapping as $entry) {
            $sourceUserId = (string) ($entry['source_user_id'] ?? '');
            $targetUserId = (string) ($entry['target_user_id'] ?? '');
            $targetOrgCode = (string) ($entry['target_org_code'] ?? '');

            if ($sourceUserId === '' || $targetUserId === '' || $targetOrgCode === '') {
                $this->warn('Skipping entry with missing source_user_id, target_user_id, or target_org_code.');
                ++$totalSkip;
                continue;
            }

            $this->line('');
            $this->line(sprintf(
                '==> Importing agents: source_user=%s → target_user=%s (org: %s)',
                $sourceUserId,
                $targetUserId,
                $targetOrgCode
            ));

            [$success, $fail, $skip, $rows] = $this->importUserAgents(
                $sourceUserId,
                $targetUserId,
                $targetOrgCode,
                $sourceDir
            );

            $totalSuccess += $success;
            $totalFail += $fail;
            $totalSkip += $skip;
            $resultRows = array_merge($resultRows, $rows);
        }

        $this->line('');
        $this->line(sprintf(
            'Import complete. Success: %d, Failed: %d, Skipped: %d',
            $totalSuccess,
            $totalFail,
            $totalSkip
        ));

        // Print summary table
        if (! empty($resultRows)) {
            $this->line('');
            $this->line('=== Import Result Summary ===');
            $this->line(sprintf('%-40s %-36s %-8s %s', 'Name', 'Code', 'Status', 'Reason'));
            $this->line(str_repeat('-', 120));
            foreach ($resultRows as $row) {
                $this->line(sprintf(
                    '%-40s %-36s %-8s %s',
                    mb_substr($row['name'], 0, 40),
                    $row['code'],
                    $row['status'],
                    $row['reason']
                ));
            }
            $this->line(str_repeat('-', 120));
        }
    }

    /**
     * Import all agent ZIPs for a single mapping entry.
     *
     * @return array{0: int, 1: int, 2: int, 3: array<int, array{code: string, name: string, zip: string, status: string, reason: string}>}
     *                                                                                                                                      [success, fail, skip, resultRows]
     */
    private function importUserAgents(
        string $sourceUserId,
        string $targetUserId,
        string $targetOrgCode,
        string $sourceDir
    ): array {
        $userEntity = $this->magicUserDomainService->getByUserId($targetUserId);
        if ($userEntity === null) {
            $this->error("Target user not found in this environment: {$targetUserId}. Skipping entire entry.");
            $this->logger->error('Target user not found during agent migration', [
                'target_user_id' => $targetUserId,
                'target_org_code' => $targetOrgCode,
                'source_user_id' => $sourceUserId,
            ]);
            return [0, 0, 1, []];
        }

        $authorization = MagicUserAuthorization::fromUserEntity($userEntity);
        $authorization->setOrganizationCode($targetOrgCode);

        $requestContext = new RequestContext();
        $requestContext->setUserAuthorization($authorization);

        $userSourceDir = $sourceDir . '/' . $sourceUserId;
        if (! is_dir($userSourceDir)) {
            $this->warn("No export directory found for source user: {$sourceUserId} (expected: {$userSourceDir})");
            return [0, 0, 1, []];
        }

        $zipFiles = glob($userSourceDir . '/*.zip');
        if (empty($zipFiles)) {
            $this->line("  No ZIP files found for source user: {$sourceUserId}");
            return [0, 0, 0, []];
        }

        $this->line(sprintf('  Found %d ZIP file(s). Starting import...', count($zipFiles)));

        $success = 0;
        $fail = 0;
        $resultRows = [];

        foreach ($zipFiles as $zipPath) {
            $filename = basename($zipPath);
            $this->line(sprintf('  → Importing: %s', $filename));

            try {
                $agentEntity = $this->importAgentAppService->import(
                    $authorization,
                    $requestContext,
                    $zipPath,
                    $filename
                );

                ++$success;
                $this->line(sprintf(
                    '    Imported successfully: code=%s name=%s',
                    $agentEntity->getCode(),
                    $agentEntity->getName()
                ));

                $resultRows[] = [
                    'code' => $agentEntity->getCode(),
                    'name' => $agentEntity->getName(),
                    'zip' => $filename,
                    'status' => 'SUCCESS',
                    'reason' => '',
                ];

                $this->logger->info('Agent imported during migration', [
                    'source_user_id' => $sourceUserId,
                    'target_user_id' => $targetUserId,
                    'target_org_code' => $targetOrgCode,
                    'agent_code' => $agentEntity->getCode(),
                    'agent_name' => $agentEntity->getName(),
                    'zip_file' => $filename,
                ]);
            } catch (Throwable $throwable) {
                ++$fail;
                $errMsg = $throwable->getMessage();
                $this->error(sprintf('    Import failed for %s: %s', $filename, $errMsg));

                $resultRows[] = [
                    'code' => '-',
                    'name' => '-',
                    'zip' => $filename,
                    'status' => 'FAILED',
                    'reason' => mb_substr($errMsg, 0, 80),
                ];

                $this->logger->error('Agent import failed during migration', [
                    'source_user_id' => $sourceUserId,
                    'target_user_id' => $targetUserId,
                    'target_org_code' => $targetOrgCode,
                    'zip_file' => $filename,
                    'error' => $errMsg,
                    'trace' => $throwable->getTraceAsString(),
                ]);
            }
        }

        return [$success, $fail, 0, $resultRows];
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
}
