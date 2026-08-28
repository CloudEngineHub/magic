<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Util\File;

/**
 * 统一识别 provider 专用素材 URI，避免各层重复实现协议校验。
 */
final class ProviderAssetUri
{
    /**
     * 判断 URI 是否为受控的 asset:// 素材引用。
     */
    public static function isValid(string $uri): bool
    {
        return preg_match('/^asset:\/\/[A-Za-z0-9][A-Za-z0-9._-]*$/', trim($uri)) === 1;
    }
}
