<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    // 通用向量索引总开关。关闭后，所有业务默认不使用向量索引。
    'enabled' => (bool) env('VECTOR_INDEX_ENABLED', false),

    // 向量数据库不可用时的短缓存时间，避免每次请求都重复探测服务。
    'availability_cache_seconds' => (int) env('VECTOR_INDEX_AVAILABILITY_CACHE_SECONDS', 60),

    // 向量索引使用的 Embedding 模型。
    'embedding_model' => (string) env('VECTOR_INDEX_EMBEDDING_MODEL', ''),

    // 各业务的独立开关和索引参数。后续 Skill、Agent 可以在这里增加自己的配置。
    'resources' => [
        'slides_template' => [
            // 幻灯片模板向量搜索开关，必须同时打开通用开关和本业务开关。
            'enabled' => (bool) env('SLIDES_TEMPLATE_VECTOR_SEARCH_ENABLED', false),
            'collection' => (string) env('SLIDES_TEMPLATE_VECTOR_COLLECTION', 'slides_templates'),
            'score_threshold' => (float) env('SLIDES_TEMPLATE_VECTOR_SCORE_THRESHOLD', 0.4),
        ],
    ],
];
