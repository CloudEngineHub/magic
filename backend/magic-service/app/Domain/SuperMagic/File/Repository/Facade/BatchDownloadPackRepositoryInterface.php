<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\File\Repository\Facade;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\FileConverter\Request\FileConverterRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\FileConverter\Response\FileConverterResponse;

interface BatchDownloadPackRepositoryInterface
{
    public function submitPackTask(
        DataIsolation $dataIsolation,
        string $sandboxId,
        string $projectId,
        FileConverterRequest $request,
        string $workDir
    ): FileConverterResponse;

    public function queryPackTask(DataIsolation $dataIsolation, string $sandboxId, string $projectId, string $taskKey): FileConverterResponse;
}
