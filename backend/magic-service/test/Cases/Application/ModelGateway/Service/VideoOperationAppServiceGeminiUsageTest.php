<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\ModelGateway\Service;

use App\Application\ModelGateway\Service\VideoOperationAppService;
use App\Domain\ModelGateway\Entity\ValueObject\VideoOperationStatus;
use App\Domain\ModelGateway\Entity\VideoQueueOperationEntity;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/** @internal */
final class VideoOperationAppServiceGeminiUsageTest extends TestCase
{
    public function testNormalizesGeminiUsageForBilling(): void
    {
        $operation = new VideoQueueOperationEntity(
            'operation-1',
            'video',
            'gemini-omni-1.1-flash',
            'gemini-omni-1.1-flash',
            'provider-model',
            'Gemini',
            'Google',
            'org-test',
            'user-test',
            VideoOperationStatus::SUCCEEDED,
            1,
            providerResult: [
                'usage' => [
                    'total_input_tokens' => 100,
                    'total_output_tokens' => 540,
                    'total_thought_tokens' => 40,
                    'output_tokens_by_modality' => [
                        ['modality' => 'text', 'tokens' => 200],
                        ['modality' => 'video', 'tokens' => 300],
                    ],
                ],
            ],
        );
        $service = (new ReflectionClass(VideoOperationAppService::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(VideoOperationAppService::class, 'resolveVideoProviderUsageTokens');
        $method->setAccessible(true);

        self::assertSame([
            'completion_tokens' => 540,
            'total_tokens' => 640,
            'billing_token_usage' => [
                'input_tokens' => 100,
                'output_text_tokens' => 200,
                'output_video_tokens' => 300,
                'thought_tokens' => 40,
            ],
        ], $method->invoke($service, $operation));
    }
}
