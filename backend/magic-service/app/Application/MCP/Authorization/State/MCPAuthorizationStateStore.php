<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MCP\Authorization\State;

use Hyperf\Contract\ConfigInterface;
use Hyperf\Redis\Redis;

/**
 * MCP Authorization state 的 Redis 一次性存储。
 */
class MCPAuthorizationStateStore
{
    public function __construct(
        private readonly Redis $redis,
        private readonly ConfigInterface $config
    ) {
    }

    /**
     * 写入授权 state。
     *
     * @param array<string, mixed> $data
     */
    public function put(string $state, array $data): void
    {
        $ttl = (int) $this->config->get('mcp_authorization.state_ttl', 600);
        $this->redis->set($this->key($state), serialize($data), ['EX' => $ttl]);
    }

    /**
     * 读取授权 state。
     *
     * @return null|array<string, mixed>
     */
    public function get(string $state): ?array
    {
        if ($state === '') {
            return null;
        }
        $value = $this->redis->get($this->key($state));
        if (! is_string($value) || $value === '') {
            return null;
        }
        $data = unserialize($value, ['allowed_classes' => false]);
        return is_array($data) ? $data : null;
    }

    /**
     * 使用 Lua 在 Redis 中原子读取并删除授权 state，防止回调重放。
     *
     * @return null|array<string, mixed>
     */
    public function consume(string $state): ?array
    {
        if ($state === '') {
            return null;
        }
        $value = $this->redis->eval(
            'local value = redis.call("get", KEYS[1]); if value then redis.call("del", KEYS[1]); end; return value',
            [$this->key($state)],
            1
        );
        if (! is_string($value) || $value === '') {
            return null;
        }
        $data = unserialize($value, ['allowed_classes' => false]);
        return is_array($data) ? $data : null;
    }

    private function key(string $state): string
    {
        return 'mcp_authorization_state:' . $state;
    }
}
