<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\ImageGenerate;

use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\OpenAIFormatResponse;
use HyperfTest\HttpTestCase;
use RuntimeException;

/** @internal */
class OpenAIFormatResponseFailureTest extends HttpTestCase
{
    public function testProviderThrowableIsAvailableInternallyButNotSerialized(): void
    {
        $throwable = new RuntimeException('specific provider failure', 500);
        $response = (new OpenAIFormatResponse())->setProviderError($throwable);

        $this->assertSame($throwable, $response->getProviderThrowable());
        $this->assertSame(500, $response->getProviderErrorCode());
        $this->assertSame('specific provider failure', $response->getProviderErrorMessage());
        $this->assertArrayNotHasKey('providerThrowable', $response->toArray());
        $this->assertArrayNotHasKey('provider_throwable', $response->toArray());
    }

    public function testBuildErrorKeepsThrowableOutOfSerializedPayload(): void
    {
        $throwable = new RuntimeException('internal failure', 500);
        $response = OpenAIFormatResponse::buildError(44000, '文生图服务异常', $throwable);

        $this->assertSame($throwable, $response->getProviderThrowable());
        $this->assertSame('文生图服务异常', $response->toArray()['provider_error_message']);
        $this->assertSame(44000, $response->getProviderErrorCode());
        $this->assertArrayNotHasKey('providerThrowable', $response->toArray());
        $this->assertArrayNotHasKey('provider_throwable', $response->toArray());
    }
}
