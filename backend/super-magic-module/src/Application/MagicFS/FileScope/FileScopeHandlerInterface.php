<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\MagicFS\FileScope;

use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Request\ListFilesRequestDTO;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Response\ListFilesResponseDTO;

/**
 * 文件作用域处理器接口。
 */
interface FileScopeHandlerInterface
{
    /**
     * 查询指定作用域下的文件列表。
     */
    public function listFiles(
        MagicUserAuthorization $authorization,
        ListFilesRequestDTO $requestDTO,
    ): ListFilesResponseDTO;
}
