<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\FileConverter;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\FileConverter\Request\FileConverterRequest;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\FileConverter\Response\FileConverterResponse;

interface FileConverterInterface
{
    /**
     * 转换文件.
     */
    public function convert(DataIsolation $dataIsolation, string $sandboxId, string $projectId, FileConverterRequest $request, string $workDir): FileConverterResponse;

    /**
     * 查询转换结果.
     *
     * @param DataIsolation $dataIsolation per-call user identity
     * @param string $sandboxId 沙箱ID
     * @param string $projectId 项目ID
     * @param string $taskKey 任务key
     * @return FileConverterResponse 转换结果
     */
    public function queryConvertResult(DataIsolation $dataIsolation, string $sandboxId, string $projectId, string $taskKey): FileConverterResponse;
}
