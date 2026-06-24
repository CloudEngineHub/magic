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

    // 定时恢复 pending 擦除/扩图任务时，每轮最多扫描并重新投递的任务数。
    'pending_scan_limit' => (int) env('DESIGN_IMAGE_OPERATION_PENDING_SCAN_LIMIT', 20),

    // 下游擦除/扩图接口允许的单张输入图片最大字节数。
    'input_max_bytes' => (int) env('DESIGN_IMAGE_OPERATION_INPUT_MAX_BYTES', 5 * 1024 * 1024),

    // 通过云存储图片处理参数按需压缩/转码时，普通图片和 mask 的长边上限。
    'normalized_max_edge' => (int) env('DESIGN_IMAGE_OPERATION_NORMALIZED_MAX_EDGE', 2048),

    // 普通图片转 jpg 后的质量；mask 固定转 png，不设置有损质量参数。
    'normalized_quality' => (int) env('DESIGN_IMAGE_OPERATION_NORMALIZED_QUALITY', 85),
];
