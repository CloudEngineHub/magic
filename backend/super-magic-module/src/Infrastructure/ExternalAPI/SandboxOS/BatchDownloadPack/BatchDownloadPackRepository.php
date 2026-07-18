<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\BatchDownloadPack;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\BatchDownloadPackRepositoryInterface;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\FileConverter\FileConverterInterface;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\FileConverter\Request\FileConverterRequest;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\FileConverter\Response\FileConverterResponse;

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
