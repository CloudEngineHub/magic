<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\Memory\File;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\MentionDataInterface;
use App\Infrastructure\Core\AbstractDTO;

/**
 * 记忆文件 mention 的数据对象。
 */
final class MemoryFileData extends AbstractDTO implements MentionDataInterface
{
    protected string $fileId;

    protected string $fileName;

    protected string $filePath;

    protected string $fileExtension;

    /** 获取记忆文件 ID。 */
    public function getFileId(): ?string
    {
        return $this->fileId ?? null;
    }

    /** 设置记忆文件 ID。 */
    public function setFileId(string $fileId): void
    {
        $this->fileId = $fileId;
    }

    /** 获取记忆文件名称。 */
    public function getFileName(): ?string
    {
        return $this->fileName ?? null;
    }

    /** 设置记忆文件名称。 */
    public function setFileName(string $fileName): void
    {
        $this->fileName = $fileName;
    }

    /** 获取记忆文件路径。 */
    public function getFilePath(): ?string
    {
        return $this->filePath ?? null;
    }

    /** 设置记忆文件路径。 */
    public function setFilePath(string $filePath): void
    {
        $this->filePath = $filePath;
    }

    /** 获取记忆文件扩展名。 */
    public function getFileExtension(): ?string
    {
        return $this->fileExtension ?? null;
    }

    /** 设置记忆文件扩展名。 */
    public function setFileExtension(string $fileExtension): void
    {
        $this->fileExtension = $fileExtension;
    }
}
