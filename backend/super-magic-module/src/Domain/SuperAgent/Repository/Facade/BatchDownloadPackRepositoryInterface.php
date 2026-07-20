<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\FileConverter\Request\FileConverterRequest;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\FileConverter\Response\FileConverterResponse;

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
