<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    // 擦除/扩图共用的最大运行并发数；<= 0 表示关闭应用层并发限制。
    'max_concurrency' => (int) env('DESIGN_IMAGE_OPERATION_MAX_CONCURRENCY', 2),

    // Redis 并发槽租约 TTL，防止进程异常退出后槽位永久占用。
    'slot_ttl_seconds' => (int) env('DESIGN_IMAGE_OPERATION_SLOT_TTL_SECONDS', 600),

    // 下游擦除/扩图接口允许的单张输入图片最大字节数。
    'input_max_bytes' => (int) env('DESIGN_IMAGE_OPERATION_INPUT_MAX_BYTES', 5 * 1024 * 1024),
];
