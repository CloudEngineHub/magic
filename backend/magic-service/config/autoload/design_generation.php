<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    'image_operation' => [
        // 擦除/扩图共用的最大运行并发数；<= 0 表示关闭应用层并发限制。
        'max_concurrency' => (int) env('DESIGN_IMAGE_OPERATION_MAX_CONCURRENCY', 2),

        // 下游擦除/扩图接口允许的单张输入图片最大字节数。
        'input_max_bytes' => (int) env('DESIGN_IMAGE_OPERATION_INPUT_MAX_BYTES', 5 * 1024 * 1024),
    ],

    'video_poll' => [
        /*
         * 延迟队列等待时间，单位毫秒，默认 10 秒.
         */
        'delay_ms' => (int) env('DESIGN_VIDEO_POLL_DELAY_MS', 10000),

        /*
         * 视频生成超时时间，单位秒，默认 3600 秒（1小时）.
         */
        'timeout_seconds' => (int) env('DESIGN_VIDEO_POLL_TIMEOUT_SECONDS', 3600),
    ],
];
