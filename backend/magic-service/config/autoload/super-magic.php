<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    'phones' => [],
    'task_number_limit' => 3,
    'user_task_limits' => [],
    'sandbox' => [
        'magic_service_ws_host' => \Hyperf\Support\env('APP_WS_HOST', '') !== ''
            ? \Hyperf\Support\env('APP_WS_HOST', '')
            : \Hyperf\Support\env('APP_HOST', ''),
        'gateway' => \Hyperf\Support\env('SANDBOX_GATEWAY', ''),
        'token' => \Hyperf\Support\env('SANDBOX_TOKEN', ''),
        'enabled' => \Hyperf\Support\env('SANDBOX_ENABLE', true),
        'message_mode' => \Hyperf\Support\env('SANDBOX_MESSAGE_MODE', 'consume'),
        'callback_host' => \Hyperf\Support\env('APP_HOST', ''),
        'deployment_id' => \Hyperf\Support\env('DEPLOYMENT_ID', ''),
    ],
    'share' => [
        'encrypt_key' => \Hyperf\Support\env('SHARE_ENCRYPT_KEY', ''),
        'encrypt_iv' => \Hyperf\Support\env('SHARE_ENCRYPT_IV', ''),
    ],
    'task' => [
        'tool_message' => [
            'object_storage_enabled' => \Hyperf\Support\env('TOOL_MESSAGE_OBJECT_STORAGE_ENABLED', true),
            'min_content_length' => \Hyperf\Support\env('TOOL_MESSAGE_MIN_CONTENT_LENGTH', 200),
        ],
        'check_task_crontab' => [
            'enabled' => \Hyperf\Support\env('CHECK_TASK_CRONTAB_ENABLED', true),
        ],
    ],
    'message' => [
        'process_mode' => \Hyperf\Support\env('SUPER_MAGIC_MESSAGE_PROCESS_MODE', 'direct'), // direct OR queue
        'enable_compensate' => \Hyperf\Support\env('SUPER_MAGIC_MESSAGE_ENABLE_COMPENSATE', false),
    ],
    'visible_ai_watermark' => [
        'enabled' => filter_var(
            \Hyperf\Support\env('SUPER_MAGIC_VISIBLE_AI_WATERMARK_ENABLED', false),
            FILTER_VALIDATE_BOOLEAN
        ),
    ],
    'user_message_queue' => [
        'enabled' => \Hyperf\Support\env('USER_MESSAGE_QUEUE_ENABLED', true),
        'whitelist' => array_filter(explode(',', \Hyperf\Support\env('USER_MESSAGE_QUEUE_WHITELIST', ''))),
    ],
    'file_version' => [
        'max_versions' => \Hyperf\Support\env('FILE_VERSION_MAX_VERSIONS', 10),
    ],
    'agent' => [
        // Base path inside the agent sandbox where cross-project mounts live.
        // Used to translate relative file_path/directory_path in cross-project
        // mentions into absolute paths the agent can read.
        'referenced_project_mount_base_path' => \Hyperf\Support\env(
            'AGENT_REFERENCED_PROJECT_MOUNT_BASE_PATH',
            '/mnt/agfs/magicfs/referenced-projects'
        ),
    ],
    'statistics' => [
        // Organization codes to exclude from statistics
        'organization_whitelist' => array_filter(explode(',', \Hyperf\Support\env('STATISTICS_ORGANIZATION_WHITELIST', ''))),
    ],
    'warm_pool' => [
        'enabled' => (bool) \Hyperf\Support\env('SUPER_MAGIC_WARM_POOL_ENABLED', true),
        'target_size' => (int) \Hyperf\Support\env('SUPER_MAGIC_WARM_POOL_TARGET_SIZE', 10),
        // Optional allowlist of magic user ids that are eligible for the warm
        // pool fast path. When non-empty, every other user falls back to the
        // cold create path — used as a kill switch while the warm pool is
        // still being stabilised. Empty string means "no restriction".
        'allowed_user_ids' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) \Hyperf\Support\env('SUPER_MAGIC_WARM_POOL_ALLOWED_USER_IDS', ''))
        ))),
        // When false, sandbox-gateway skips the agfs-server readiness probe
        // and returns immediately after the pod is created. Useful for local
        // dev where the host can't reach pod-CIDR IPs (e.g. kind on macOS).
        'enable_readiness' => (bool) \Hyperf\Support\env('SUPER_MAGIC_WARM_POOL_ENABLE_READINESS', true),
        // Logical environment tag for the warm pool. Every row is stamped with
        // this value, and every refill/evict/claim/drain query is scoped to it,
        // so multiple environments (pre/prod/...) can safely share the same
        // table without stomping on each other's pool. Defaults to APP_ENV.
        'env' => (string) (\Hyperf\Support\env('APP_ENV', 'default') ?: 'default'),
        // --- Refill circuit breaker -------------------------------------
        // When pods keep failing to come up (e.g. nodes out of disk), each
        // failed create leaks a pod and worsens the cluster, so blindly
        // refilling feeds a death spiral. The breaker counts recent `error`
        // rows and stops refilling once failures pile up, then probes for
        // recovery. Set threshold <= 0 to disable the breaker.
        'failure_window_minutes' => (int) \Hyperf\Support\env('SUPER_MAGIC_WARM_POOL_FAILURE_WINDOW_MINUTES', 5),
        'failure_threshold' => (int) \Hyperf\Support\env('SUPER_MAGIC_WARM_POOL_FAILURE_THRESHOLD', 10),
        // Once tripped, how long with ZERO new failures before a single
        // half-open probe create is allowed.
        'breaker_cooldown_seconds' => (int) \Hyperf\Support\env('SUPER_MAGIC_WARM_POOL_BREAKER_COOLDOWN_SECONDS', 60),
        // Abort the current refill burst after this many back-to-back
        // failures, so one bad tick can't fire the whole burst at an
        // unhealthy cluster.
        'max_consecutive_failures' => (int) \Hyperf\Support\env('SUPER_MAGIC_WARM_POOL_MAX_CONSECUTIVE_FAILURES', 3),
        // How long a failed-create (`error`) tombstone is kept before the
        // cleanup pass reaps it (and best-effort re-deletes any leaked pod).
        // MUST exceed failure_window_minutes so the breaker can count it.
        // Set <= 0 to disable the cleanup pass.
        'error_retention_minutes' => (int) \Hyperf\Support\env('SUPER_MAGIC_WARM_POOL_ERROR_RETENTION_MINUTES', 15),
    ],
];
