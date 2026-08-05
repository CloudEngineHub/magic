<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\Memory\Directory;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\MentionDataInterface;
use App\Infrastructure\Core\AbstractDTO;

/**
 * 记忆目录 mention 的数据对象。
 */
final class MemoryDirectoryData extends AbstractDTO implements MentionDataInterface
{
    protected string $directoryId;

    protected string $directoryName;

    protected string $directoryPath;

    /** 获取记忆目录 ID。 */
    public function getDirectoryId(): ?string
    {
        return $this->directoryId ?? null;
    }

    /** 设置记忆目录 ID。 */
    public function setDirectoryId(string $directoryId): void
    {
        $this->directoryId = $directoryId;
    }

    /** 获取记忆目录名称。 */
    public function getDirectoryName(): ?string
    {
        return $this->directoryName ?? null;
    }

    /** 设置记忆目录名称。 */
    public function setDirectoryName(string $directoryName): void
    {
        $this->directoryName = $directoryName;
    }

    /** 获取记忆目录路径。 */
    public function getDirectoryPath(): ?string
    {
        return $this->directoryPath ?? null;
    }

    /** 设置记忆目录路径。 */
    public function setDirectoryPath(string $directoryPath): void
    {
        $this->directoryPath = $directoryPath;
    }
}
