<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    // 向量数据库不可用时的短缓存时间，避免每次请求都重复探测服务。
    'availability_cache_seconds' => (int) env('VECTOR_INDEX_AVAILABILITY_CACHE_SECONDS', 60),

    // Fixed embedding dimension policy.
    // Disabled (default): validate against the model declaration and create collections from actual output.
    // Enabled: use the configured size for validation and collection creation, and reject output drift.
    'embedding_dimension' => [
        'enabled' => (bool) env('VECTOR_INDEX_EMBEDDING_DIMENSION_ENABLED', false),
        'size' => (int) env('VECTOR_INDEX_EMBEDDING_DIMENSION_SIZE', 2048),
    ],

    // 各业务的索引参数。是否启用统一由对应 AI 能力配置决定。
    'resources' => [
        'slides_template' => [
            'collection' => (string) env('SLIDES_TEMPLATE_VECTOR_COLLECTION', 'slides_templates'),
            'score_threshold' => (float) env('SLIDES_TEMPLATE_VECTOR_SCORE_THRESHOLD', 0.4),
        ],
        'skill_market' => [
            'collection' => (string) env('SKILL_MARKET_VECTOR_COLLECTION', 'skill_markets'),
            'score_threshold' => (float) env('SKILL_MARKET_VECTOR_SCORE_THRESHOLD', 0.4),
        ],
        'agent_market' => [
            'collection' => (string) env('AGENT_MARKET_VECTOR_COLLECTION', 'agent_markets'),
            'score_threshold' => (float) env('AGENT_MARKET_VECTOR_SCORE_THRESHOLD', 0.4),
        ],
    ],
];
