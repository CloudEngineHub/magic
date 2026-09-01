<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\VideoGenerateAPI;

use App\ErrorCode\VideoGenerateErrorCode;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoErrorMapper;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class VideoProviderErrorMapperTest extends TestCase
{
    public function testMapsWhitelistedProviderCodeToVideoErrorCode(): void
    {
        self::assertSame(
            VideoGenerateErrorCode::INPUT_VIDEO_AUDIT_FAILED,
            ProviderVideoErrorMapper::resolve('InputVideoSensitiveContentDetected.PrivacyInformation'),
        );
    }

    public function testMapsUnknownBadRequestToGenericErrorAndNonRetriable(): void
    {
        self::assertSame(
            VideoGenerateErrorCode::GENERAL_ERROR,
            ProviderVideoErrorMapper::resolve('UnknownProviderCode', 400),
        );
        self::assertFalse(ProviderVideoErrorMapper::isRetriable(400));
    }

    /**
     * @dataProvider geminiProviderCodeMap
     */
    public function testMapsGeminiProviderCodes(string $providerCode, VideoGenerateErrorCode $expected): void
    {
        self::assertSame($expected, ProviderVideoErrorMapper::resolve($providerCode));
    }

    /**
     * @return iterable<string, array{string, VideoGenerateErrorCode}>
     */
    public static function geminiProviderCodeMap(): iterable
    {
        yield 'invalid argument' => ['INVALID_ARGUMENT', VideoGenerateErrorCode::INVALID_PARAMETER];
        yield 'resource exhausted' => ['RESOURCE_EXHAUSTED', VideoGenerateErrorCode::QUOTA_EXCEEDED];
        yield 'unauthenticated' => ['UNAUTHENTICATED', VideoGenerateErrorCode::AUTHENTICATION_FAILED];
        yield 'permission denied' => ['PERMISSION_DENIED', VideoGenerateErrorCode::AUTHENTICATION_FAILED];
        yield 'rate limited' => ['RATE_LIMITED', VideoGenerateErrorCode::RATE_LIMITED];
    }

    public function testMapsBareHttpStatuses(): void
    {
        self::assertSame(VideoGenerateErrorCode::AUTHENTICATION_FAILED, ProviderVideoErrorMapper::resolve(null, 401));
        self::assertSame(VideoGenerateErrorCode::AUTHENTICATION_FAILED, ProviderVideoErrorMapper::resolve(null, 403));
        self::assertSame(VideoGenerateErrorCode::RATE_LIMITED, ProviderVideoErrorMapper::resolve(null, 429));
        self::assertSame(VideoGenerateErrorCode::GENERAL_ERROR, ProviderVideoErrorMapper::resolve(null, 500));
    }

    public function testMarksTransientStatusesRetriable(): void
    {
        self::assertTrue(ProviderVideoErrorMapper::isRetriable(429));
        self::assertTrue(ProviderVideoErrorMapper::isRetriable(500));
        self::assertTrue(ProviderVideoErrorMapper::isRetriable(null, true));
        self::assertFalse(ProviderVideoErrorMapper::isRetriable(500, false, VideoGenerateErrorCode::INVALID_PARAMETER));
    }

    public function testProviderExceptionKeepsSafeMessageAndOptionalErrorCode(): void
    {
        $exception = ProviderVideoException::nonRetriable(
            '视频提示词未通过内容审核，请调整后重试。',
            null,
            400,
            (string) VideoGenerateErrorCode::INVALID_PROMPT->value,
        );

        self::assertSame('视频提示词未通过内容审核，请调整后重试。', $exception->getMessage());
        self::assertSame((string) VideoGenerateErrorCode::INVALID_PROMPT->value, $exception->getErrorCode());
        self::assertSame(400, $exception->getHttpStatus());
        self::assertFalse($exception->isRetriable());
    }
}
