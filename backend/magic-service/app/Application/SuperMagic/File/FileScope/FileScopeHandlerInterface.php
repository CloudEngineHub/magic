<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\File\FileScope;

use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\SuperMagic\File\DTO\Request\GetProjectAttachmentsRequestDTO;
use App\Interfaces\SuperMagic\File\DTO\Request\GetProjectAttachmentsV2RequestDTO;
use App\Interfaces\SuperMagic\File\MagicFS\DTO\Request\ListFilesRequestDTO;
use App\Interfaces\SuperMagic\File\MagicFS\DTO\Response\ListFilesResponseDTO;
use App\Interfaces\SuperMagic\Project\DTO\Request\ProjectUploadTokenRequestDTO;

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
