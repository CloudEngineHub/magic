<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use function Hyperf\Support\env;

$hosts = env('MAGICBASE_OPENSEARCH_HOSTS', 'http://127.0.0.1:9200');

return [
    'mongodb' => [
        'uri' => env('MAGICBASE_MONGODB_URI', 'mongodb://127.0.0.1:27017'),
        'database' => env('MAGICBASE_MONGODB_DATABASE', 'magicbase'),
        'collection_count' => (int) env('MAGICBASE_MONGODB_COLLECTION_COUNT', 256),
    ],
    'opensearch' => [
        'hosts' => is_string($hosts) ? array_filter(array_map('trim', explode(',', $hosts))) : ['http://127.0.0.1:9200'],
        'username' => env('MAGICBASE_OPENSEARCH_USERNAME', ''),
        'password' => env('MAGICBASE_OPENSEARCH_PASSWORD', ''),
        'ssl_verification' => (bool) env('MAGICBASE_OPENSEARCH_SSL_VERIFICATION', false),
        'index_prefix' => env('MAGICBASE_OPENSEARCH_INDEX_PREFIX', 'magicbase_rows'),
        'search_size' => (int) env('MAGICBASE_OPENSEARCH_SEARCH_SIZE', 10000),
        'refresh' => env('MAGICBASE_OPENSEARCH_REFRESH', 'wait_for'),
    ],
];
