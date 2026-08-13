<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Flow\ExecuteManager\Attachment;

/**
 * 这里的附件一定是已经在云服务端了.
 */
class Attachment extends AbstractAttachment
{
    public function __construct(
        string $name,
        string $url,
        string $ext,
        int $size,
        string $chatFileId = '',
        string $originAttachment = ''
    ) {
        $this->originAttachment = $originAttachment;
        if (empty($this->originAttachment)) {
            $this->originAttachment = $url;
        }
        $this->name = $name;
        $this->size = $size;
        $this->chatFileId = $chatFileId;
        $this->url = trim($url);
        $this->ext = $this->resolveExtension($ext, $name, $this->url);
    }

    /**
     * 从附件参数、文件名或 URL 路径解析扩展名，避免在附件构造阶段发起远程请求。
     */
    private function resolveExtension(string $extension, string $name, string $url): string
    {
        $extension = ltrim(strtolower(trim($extension)), '.');
        if ($extension !== '') {
            return $extension;
        }

        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if ($extension !== '') {
            return $extension;
        }

        $urlPath = parse_url($url, PHP_URL_PATH);
        if (! is_string($urlPath)) {
            return '';
        }

        return strtolower(pathinfo($urlPath, PATHINFO_EXTENSION));
    }
}
