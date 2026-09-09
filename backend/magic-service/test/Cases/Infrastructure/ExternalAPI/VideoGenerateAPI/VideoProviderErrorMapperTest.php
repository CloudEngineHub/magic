<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\VideoGenerateAPI;

use App\ErrorCode\VideoGenerateErrorCode;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoErrorMapper;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
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

    public function testGeminiResolverHidesProviderQuotaError(): void
    {
        self::assertSame(
            VideoGenerateErrorCode::GENERAL_ERROR,
            ProviderVideoErrorMapper::resolveGemini($this->requestException(400, [
                'error' => [
                    'code' => 'RESOURCE_EXHAUSTED',
                    'message' => 'Quota exceeded',
                ],
            ])),
        );
    }

    public function testGeminiResolverMapsAspectRatioFromInvalidArgument(): void
    {
        self::assertSame(
            VideoGenerateErrorCode::INVALID_ASPECT_RATIO,
            ProviderVideoErrorMapper::resolveGemini($this->requestException(400, [
                'error' => [
                    'code' => 'INVALID_ARGUMENT',
                    'message' => 'The requested aspect ratio is not supported.',
                ],
            ])),
        );
    }

    public function testGeminiResolverMapsActualProviderErrors(): void
    {
        $cases = [
            [
                'invalid_request',
                'Edited video duration (4.958s, rounded to 1st decimal: 5s) does not match config duration (3s, rounded to 1st decimal: 3s).',
                VideoGenerateErrorCode::INVALID_PARAMETER,
            ],
            [
                'content_blocked',
                "Input blocked: Sorry, we can't create videos with real people's names or likenesses.",
                VideoGenerateErrorCode::INPUT_TEXT_AUDIT_FAILED,
            ],
            [
                'invalid_request',
                'HTTP video input is not supported by the model.',
                VideoGenerateErrorCode::INVALID_PARAMETER,
            ],
            [
                'Unable to show the generated video. The video was filtered out because it violated Google policy.',
                'Request blocked due to prohibited content guidelines.',
                VideoGenerateErrorCode::OUTPUT_VIDEO_AUDIT_FAILED,
            ],
            [
                'invalid_request',
                'Video response format duration must be positive.',
                VideoGenerateErrorCode::INVALID_PARAMETER,
            ],
        ];

        foreach ($cases as [$providerCode, $providerMessage, $expected]) {
            self::assertSame(
                $expected,
                ProviderVideoErrorMapper::resolveGemini($this->requestException(400, [
                    'error' => [
                        'code' => $providerCode,
                        'message' => $providerMessage,
                    ],
                ])),
                (string) $providerMessage,
            );
        }
    }

    /** @param array<string, mixed> $payload */
    private function requestException(int $status, array $payload): RequestException
    {
        return new RequestException(
            'provider raw message',
            new Request('POST', 'https://provider.example/video'),
            new Response($status, [], json_encode($payload, JSON_THROW_ON_ERROR)),
        );
    }

    /**
     * @dataProvider geminiMessageMap
     */
    public function testMapsGeminiProviderMessages(string $providerCode, string $providerMessage, VideoGenerateErrorCode $expected): void
    {
        self::assertSame(
            $expected,
            ProviderVideoErrorMapper::resolveGemini($this->requestException(400, [
                'error' => [
                    'code' => $providerCode,
                    'message' => $providerMessage,
                ],
            ])),
        );
    }

    /**
     * @return iterable<string, array{string, string, VideoGenerateErrorCode}>
     */
    public static function geminiMessageMap(): iterable
    {
        yield 'duration mismatch' => [
            'invalid_request',
            'Edited video duration (4.958s, rounded to 1st decimal: 5s) does not match config duration (3s, rounded to 1st decimal: 3s).',
            VideoGenerateErrorCode::INVALID_PARAMETER,
        ];
        yield 'real people likeness blocked' => [
            'content_blocked',
            "Input blocked: Sorry, we can't create videos with real people's names or likenesses.",
            VideoGenerateErrorCode::INPUT_TEXT_AUDIT_FAILED,
        ];
        yield 'http video input unsupported' => [
            'invalid_request',
            'HTTP video input is not supported by the model.',
            VideoGenerateErrorCode::INVALID_PARAMETER,
        ];
        yield 'filtered output video' => [
            'Unable to show the generated video. The video was filtered out because it violated policy.',
            'Request blocked due to prohibited content guidelines.',
            VideoGenerateErrorCode::OUTPUT_VIDEO_AUDIT_FAILED,
        ];
        yield 'non-positive duration' => [
            'invalid_request',
            'Video response format duration must be positive.',
            VideoGenerateErrorCode::INVALID_PARAMETER,
        ];
    }

    public function testGeminiResolverAcceptsAsyncResponseArray(): void
    {
        self::assertSame(
            VideoGenerateErrorCode::INVALID_PARAMETER,
            ProviderVideoErrorMapper::resolveGemini(null, [
                'error' => [
                    'code' => 'invalid_request',
                    'message' => 'Video response format duration must be positive.',
                ],
            ]),
        );
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
