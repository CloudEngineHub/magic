<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ModelGateway;

use App\Infrastructure\Core\Hyperf\EventStream;
use LogicException;
use RuntimeException;

/** 仅为模型网关提供写入失败反馈和幂等结束，保持其他SSE调用方行为。 */
class ModelGatewayEventStream extends EventStream
{
    private bool $ended = false;

    /** 写入未结束的模型响应，写入失败由网关组装器负责收尾。 */
    public function write(string $data): self
    {
        if ($this->ended) {
            throw new LogicException('流式响应已经结束');
        }
        if (! $this->connection->write($data)) {
            throw new RuntimeException('流式响应写入失败');
        }
        return $this;
    }

    /** 仅结束当前模型HTTP响应一次，不关闭共享TCP连接。 */
    public function end(): void
    {
        if ($this->ended) {
            return;
        }
        $this->ended = true;
        if ($this->connection->end() === false) {
            throw new RuntimeException('流式响应结束失败');
        }
    }
}
