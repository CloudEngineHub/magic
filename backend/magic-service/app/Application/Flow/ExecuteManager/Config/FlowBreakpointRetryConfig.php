<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Flow\ExecuteManager\Config;

/**
 * 流程断点重试配置。
 */
class FlowBreakpointRetryConfig
{
    /**
     * 判断流程断点重试是否启用。
     */
    public static function isEnabled(): bool
    {
        return filter_var(config('magic_flows.breakpoint_retry.enabled', false), FILTER_VALIDATE_BOOLEAN);
    }
}
