<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use function Hyperf\Support\env;

$hosts = env('MAGICBASE_OPENSEARCH_HOSTS', 'http://127.0.0.1:9200');

return [
    'row_storage' => [
        'driver' => env('MAGICBASE_ROW_STORAGE_DRIVER', 'mongodb'),
        'search_size' => (int) env('MAGICBASE_ROW_STORAGE_SEARCH_SIZE', 10000),
    ],
    'mongodb' => [
        'uri' => env('MAGICBASE_MONGODB_URI', 'mongodb://127.0.0.1:27017'),
        'database' => env('MAGICBASE_MONGODB_DATABASE', 'magicbase'),
        'collection_prefix' => env('MAGICBASE_MONGODB_COLLECTION_PREFIX', 'magicbase_rows'),
        'collection_count' => (int) env('MAGICBASE_MONGODB_COLLECTION_COUNT', 256),
        'connect_timeout_ms' => (int) env('MAGICBASE_MONGODB_CONNECT_TIMEOUT_MS', 3000),
        'server_selection_timeout_ms' => (int) env('MAGICBASE_MONGODB_SERVER_SELECTION_TIMEOUT_MS', 3000),
        'query_timeout_ms' => (int) env('MAGICBASE_MONGODB_QUERY_TIMEOUT_MS', 10000),
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
