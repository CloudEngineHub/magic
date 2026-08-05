<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\VideoGenerateAPI;

use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class ProviderVideoExceptionTest extends TestCase
{
    public function testClassifiesHttpFailuresByRetryability(): void
    {
        foreach ([400, 401, 403, 404] as $status) {
            $exception = ProviderVideoException::fromHttpStatus('request failed', $status);

            self::assertFalse($exception->isRetriable());
            self::assertSame($status, $exception->getHttpStatus());
        }

        foreach ([null, 408, 425, 429, 500, 503] as $status) {
            $exception = ProviderVideoException::fromHttpStatus('request failed', $status);

            self::assertTrue($exception->isRetriable());
            self::assertSame($status, $exception->getHttpStatus());
        }
    }
}
