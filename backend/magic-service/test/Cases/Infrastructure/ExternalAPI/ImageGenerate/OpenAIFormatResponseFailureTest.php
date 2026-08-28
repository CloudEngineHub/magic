<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\ImageGenerate;

use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\OpenAIFormatResponse;
use HyperfTest\HttpTestCase;

/** @internal */
class OpenAIFormatResponseFailureTest extends HttpTestCase
{
    public function testProviderErrorCanBeSerialized(): void
    {
        $response = (new OpenAIFormatResponse())
            ->setProviderErrorCode(500)
            ->setProviderErrorMessage('specific provider failure');

        $this->assertSame(500, $response->getProviderErrorCode());
        $this->assertSame('specific provider failure', $response->getProviderErrorMessage());
        $this->assertSame(500, $response->toArray()['provider_error_code']);
        $this->assertSame('specific provider failure', $response->toArray()['provider_error_message']);
    }

    public function testBuildErrorKeepsErrorFieldsInSerializedPayload(): void
    {
        $response = OpenAIFormatResponse::buildError(44000, '文生图服务异常');

        $this->assertSame('文生图服务异常', $response->toArray()['provider_error_message']);
        $this->assertSame(44000, $response->getProviderErrorCode());
        $this->assertSame(44000, $response->toArray()['provider_error_code']);
    }
}
