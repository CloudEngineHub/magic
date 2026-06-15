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

    // 普通图片归一化长边候选档位，按顺序尝试，直到处理后大小不超过 input_max_bytes。
    'normalized_max_edges' => (string) env('DESIGN_IMAGE_OPERATION_NORMALIZED_MAX_EDGES', '2048,1536,1024'),

    // 普通图片压缩质量候选档位，与 normalized_max_edges 按索引对应。
    'normalized_qualities' => (string) env('DESIGN_IMAGE_OPERATION_NORMALIZED_QUALITIES', '85,75,65'),

    // 通过 Range 请求探测归一化 URL 实际 Content-Length 的超时时间。
    'remote_size_probe_timeout_seconds' => (int) env('DESIGN_IMAGE_OPERATION_REMOTE_SIZE_PROBE_TIMEOUT_SECONDS', 3),
];
