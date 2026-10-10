<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Result;

use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Constant\ResponseCode;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Result\SandboxListResult;
use PHPUnit\Framework\TestCase;

/**
 * 网关沙箱清单（GET /api/v1/sandboxes）的解析契约。
 *
 * @internal
 */
class SandboxListResultTest extends TestCase
{
    public function testParsesGatewayListPayload(): void
    {
        $result = SandboxListResult::fromApiResponse([
            'code' => ResponseCode::SUCCESS,
            'message' => 'Sandbox list retrieved successfully',
            'data' => [
                'total' => 2,
                'sandboxes' => [
                    [
                        'sandbox_id' => 'warm-101',
                        'status' => 'Running',
                        'project_id' => '11',
                        'topic_id' => '101',
                        'warm_pool' => true,
                        'bound' => true,
                    ],
                    [
                        'sandbox_id' => '102',
                        'status' => 'NotFound',
                    ],
                ],
            ],
        ]);

        self::assertTrue($result->isSuccess());
        self::assertSame(2, $result->getTotal());
        self::assertSame([
            [
                'sandbox_id' => 'warm-101',
                'status' => 'Running',
                'project_id' => '11',
                'topic_id' => '101',
                'warm_pool' => true,
                'bound' => true,
            ],
            [
                'sandbox_id' => '102',
                'status' => 'NotFound',
                'project_id' => '',
                'topic_id' => '',
                'warm_pool' => false,
                'bound' => false,
            ],
        ], $result->getSandboxes());
        self::assertSame(['Running' => 1, 'NotFound' => 1], $result->getStatusCounts());
    }

    public function testIgnoresEntriesWithoutSandboxId(): void
    {
        $result = SandboxListResult::fromApiResponse([
            'code' => ResponseCode::SUCCESS,
            'message' => 'ok',
            'data' => [
                'sandboxes' => [
                    ['status' => 'Running'],
                    ['sandbox_id' => 'warm-1', 'status' => 'Running'],
                ],
            ],
        ]);

        self::assertSame(1, $result->getTotal());
        self::assertSame(['Running' => 1], $result->getStatusCounts());
    }

    public function testFailedResponseKeepsErrorCode(): void
    {
        $result = SandboxListResult::fromApiResponse([
            'code' => ResponseCode::ERROR,
            'message' => 'gateway exploded',
            'data' => [],
        ]);

        self::assertFalse($result->isSuccess());
        self::assertSame('gateway exploded', $result->getMessage());
        self::assertSame(0, $result->getTotal());
        self::assertSame([], $result->getSandboxes());
    }
}
