<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\BatchDownloadPack;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\SuperMagic\File\Repository\Facade\BatchDownloadPackRepositoryInterface;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\FileConverter\FileConverterInterface;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\FileConverter\Request\FileConverterRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\FileConverter\Response\FileConverterResponse;

class BatchDownloadPackRepository implements BatchDownloadPackRepositoryInterface
{
    public function __construct(
        private readonly FileConverterInterface $fileConverter,
    ) {
    }

    public function submitPackTask(
        DataIsolation $dataIsolation,
        string $sandboxId,
        string $projectId,
        FileConverterRequest $request,
        string $workDir
    ): FileConverterResponse {
        return $this->fileConverter->convert(
            $dataIsolation,
            $sandboxId,
            $projectId,
            $request,
            $workDir
        );
    }

    public function queryPackTask(DataIsolation $dataIsolation, string $sandboxId, string $projectId, string $taskKey): FileConverterResponse
    {
        return $this->fileConverter->queryConvertResult($dataIsolation, $sandboxId, $projectId, $taskKey);
    }
}
