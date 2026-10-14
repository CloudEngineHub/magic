<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ModelGateway;

use App\Infrastructure\ModelGateway\ModelGatewayEventStream;
use Hyperf\Engine\Contract\Http\Writable;
use LogicException;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/** 验证模型专用响应对象的幂等结束和失败处理。
 * @internal
 */
class ModelGatewayEventStreamTest extends TestCase
{
    /** 重复结束不能重复发HTTP结束符。 */
    public function testEndIsIdempotent(): void
    {
        $writer = $this->writer();
        $writer->expects(self::once())->method('end')->willReturn(true);
        $stream = new ModelGatewayEventStream($writer);
        $stream->end();
        $stream->end();
    }

    /** 已结束后拒绝追加数据。 */
    public function testWriteAfterEndIsRejected(): void
    {
        $stream = new ModelGatewayEventStream($this->writer());
        $stream->end();
        $this->expectException(LogicException::class);
        $stream->write('mock');
    }

    /** 底层返回false必须显式失败，不能把未发数据当成功。 */
    public function testFalseWriteResultThrows(): void
    {
        $writer = $this->writer();
        $writer->method('write')->willReturn(false);
        $stream = new ModelGatewayEventStream($writer);
        $this->expectException(RuntimeException::class);
        $stream->write('mock');
    }

    /** 底层结束失败可观察，但不重复尝试发送结束符。 */
    public function testFalseEndResultThrows(): void
    {
        $writer = $this->writer();
        $writer->method('end')->willReturn(false);
        $stream = new ModelGatewayEventStream($writer);
        $this->expectException(RuntimeException::class);
        $stream->end();
    }

    /** 用内存socket替身承接响应头，不连接服务。 */
    private function writer(): Writable
    {
        $socket = new class {
            /** 接收合成HTTP响应头。 */
            public function write(array $data): void
            {
            }
        };
        $writer = $this->createMock(Writable::class);
        $writer->method('getSocket')->willReturn($socket);
        return $writer;
    }
}
