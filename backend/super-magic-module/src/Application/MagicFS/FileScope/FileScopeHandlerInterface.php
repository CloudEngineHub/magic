<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\MagicFS\FileScope;

use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Request\ListFilesRequestDTO;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Response\ListFilesResponseDTO;
use Dtyq\SuperMagic\Interfaces\SuperAgent\DTO\Request\GetProjectAttachmentsRequestDTO;
use Dtyq\SuperMagic\Interfaces\SuperAgent\DTO\Request\GetProjectAttachmentsV2RequestDTO;
use Dtyq\SuperMagic\Interfaces\SuperAgent\DTO\Request\ProjectUploadTokenRequestDTO;

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

    /**
     * 按项目附件 V1 协议查询指定作用域下的文件列表。
     */
    public function listProjectAttachments(
        MagicUserAuthorization $authorization,
        GetProjectAttachmentsRequestDTO $requestDTO,
    ): array;

    /**
     * 按项目附件 V2 协议查询指定作用域下的文件列表。
     */
    public function listProjectAttachmentsV2(
        MagicUserAuthorization $authorization,
        GetProjectAttachmentsV2RequestDTO $requestDTO,
    ): array;

    /**
     * 统计指定作用域下的项目附件数量。
     */
    public function countProjectAttachments(MagicUserAuthorization $authorization): array;

    /**
     * 获取指定作用域的上传凭证。
     */
    public function getUploadToken(
        MagicUserAuthorization $authorization,
        ProjectUploadTokenRequestDTO $requestDTO,
    ): array;
}
