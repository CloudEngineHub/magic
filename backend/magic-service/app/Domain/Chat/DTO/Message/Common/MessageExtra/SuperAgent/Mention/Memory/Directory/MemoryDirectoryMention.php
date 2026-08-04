<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\Memory\Directory;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\AbstractMention;
use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\MentionType;

/**
 * 记忆目录 mention，负责生成消息文本和 Agent 上下文结构。
 */
final class MemoryDirectoryMention extends AbstractMention
{
    /** 生成富文本降级时使用的记忆目录引用。 */
    public function getMentionTextStruct(): string
    {
        $data = $this->getAttrs()?->getData();
        if (! $data instanceof MemoryDirectoryData) {
            return '';
        }

        return sprintf('[@memory_directory:%s]', $data->getDirectoryPath() ?? '');
    }

    /** 生成发送给 Agent 的记忆目录结构。 */
    public function getMentionJsonStruct(): array
    {
        $data = $this->getAttrs()?->getData();
        if (! $data instanceof MemoryDirectoryData) {
            return [];
        }

        return [
            'type' => MentionType::MEMORY_DIRECTORY->value,
            'directory_id' => $data->getDirectoryId(),
            'directory_name' => $data->getDirectoryName(),
            'directory_path' => $data->getDirectoryPath(),
        ];
    }
}
