<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Common\Contract;

/**
 * 默认提示词内容校验器，开源版本不执行额外检测并始终放行.
 */
final class AllowAllPromptContentValidator implements PromptContentValidatorInterface
{
    /**
     * 默认允许所有提示词继续处理.
     */
    public function isValid(string $prompt): bool
    {
        return true;
    }
}
