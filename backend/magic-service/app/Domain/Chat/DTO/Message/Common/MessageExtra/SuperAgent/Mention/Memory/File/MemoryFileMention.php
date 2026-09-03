<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\Memory\File;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\AbstractMention;
use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\MentionType;

/**
 * 记忆文件 mention，负责生成消息文本和 Agent 上下文结构。
 */
final class MemoryFileMention extends AbstractMention
{
    /** 生成富文本降级时使用的记忆文件引用。 */
    public function getMentionTextStruct(): string
    {
        $data = $this->getAttrs()?->getData();
        if (! $data instanceof MemoryFileData) {
            return '';
        }

        return sprintf('[@memory_file:%s]', $data->getFilePath() ?? '');
    }

    /** 生成发送给 Agent 的记忆文件结构。 */
    public function getMentionJsonStruct(): array
    {
        $data = $this->getAttrs()?->getData();
        if (! $data instanceof MemoryFileData) {
            return [];
        }

        return [
            'type' => MentionType::MEMORY_FILE->value,
            'file_id' => $data->getFileId(),
            'file_name' => $data->getFileName(),
            'file_path' => $data->getFilePath(),
            'file_extension' => $data->getFileExtension(),
        ];
    }
}
