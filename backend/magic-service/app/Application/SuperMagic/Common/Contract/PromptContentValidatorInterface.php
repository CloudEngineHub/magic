<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Common\Contract;

/**
 * 提示词内容校验接口，用于在内容进入大模型前判断是否允许继续处理.
 */
interface PromptContentValidatorInterface
{
    /**
     * 判断提示词内容是否合法.
     */
    public function isValid(string $prompt): bool;
}
