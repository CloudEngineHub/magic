<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Common\Service;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\SaveFilesRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\SandboxAgentInterface;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Exception\SandboxOperationException;
use App\Infrastructure\SuperMagic\Utils\WorkDirectoryUtil;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;

class SuperMagicDomainService
{
    private LoggerInterface $logger;

    public function __construct(
        LoggerFactory $loggerFactory,
        private readonly SandboxAgentInterface $agent,
    ) {
        $this->logger = $loggerFactory->get('sandbox');
    }

    public function saveFileData(DataIsolation $dataIsolation, string $sandboxId, array $fileDataList, string $workDir): array
    {
        $this->logger->info('[SuperMagic][App] Save file data', [
            'sandbox_id' => $sandboxId,
            'file_data_list' => $fileDataList,
            'work_dir' => $workDir,
        ]);
        $files = [];
        foreach ($fileDataList as $fileData) {
            $files[] = [
                'file_key' => $fileData['file_key'],
                'file_path' => WorkDirectoryUtil::getRelativeFilePath($fileData['file_key'], $workDir),
                'content' => $fileData['content'],
                'is_encrypted' => $fileData['is_encrypted'],
            ];
        }

        $request = SaveFilesRequest::create($files);
        $response = $this->agent->saveFiles($dataIsolation, $sandboxId, $request);

        if (! $response->isSuccess()) {
            throw new SandboxOperationException(
                'Save files via sandbox',
                $response->getMessage(),
                $response->getCode()
            );
        }

        return $response->getData();
    }
}
