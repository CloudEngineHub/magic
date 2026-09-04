<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    'encryption_key' => env('MCP_AUTHORIZATION_ENCRYPTION_KEY', env('SHARE_ENCRYPT_KEY', '')),
    'state_ttl' => (int) env('MCP_AUTHORIZATION_STATE_TTL', 600),
    'token_expiry_leeway' => (int) env('MCP_AUTHORIZATION_TOKEN_EXPIRY_LEEWAY', 30),
];
