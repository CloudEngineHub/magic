<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\ModelGateway\Entity\Dto;

use App\Domain\ModelGateway\Entity\Dto\ImageEraserRequestDTO;
use App\Domain\ModelGateway\Entity\Dto\ImageExpandRequestDTO;
use App\ErrorCode\MagicApiErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;
use Hyperf\Codec\Packer\PhpSerializerPacker;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\TranslatorInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use RuntimeException;

/**
 * @internal
 * @covers \App\Domain\ModelGateway\Entity\Dto\ImageEraserRequestDTO
 * @covers \App\Domain\ModelGateway\Entity\Dto\ImageExpandRequestDTO
 */
class ImageEraserAndExpandRequestDTOTest extends TestCase
{
    public static function setUpBeforeClass(): void
    {
        if (! ApplicationContext::hasContainer()) {
            ApplicationContext::setContainer(new class implements ContainerInterface {
                public function get(string $id)
                {
                    return match ($id) {
                        PhpSerializerPacker::class => new PhpSerializerPacker(),
                        ConfigInterface::class => new class implements ConfigInterface {
                            public function get(string $key, mixed $default = null): mixed
                            {
                                return match ($key) {
                                    'error_message' => [
                                        'exception_class' => BusinessException::class,
                                        'error_code_mapper' => [
                                            MagicApiErrorCode::class => [4000, 4999],
                                        ],
                                    ],
                                    default => $default,
                                };
                            }

                            public function has(string $keys): bool
                            {
                                return $keys === 'error_message';
                            }

                            public function set(string $key, mixed $value): void
                            {
                            }
                        },
                        TranslatorInterface::class => new class implements TranslatorInterface {
                            public function trans(string $key, array $replace = [], ?string $locale = null): array|string
                            {
                                foreach ($replace as $replaceKey => $replaceValue) {
                                    $key = str_replace(':' . $replaceKey, (string) $replaceValue, $key);
                                }
                                return $key;
                            }

                            public function transChoice(string $key, $number, array $replace = [], ?string $locale = null): string
                            {
                                return (string) $this->trans($key, $replace, $locale);
                            }

                            public function getLocale(): string
                            {
                                return 'zh_CN';
                            }

                            public function setLocale(string $locale)
                            {
                            }
                        },
                        default => throw new RuntimeException('Unsupported service: ' . $id),
                    };
                }

                public function has(string $id): bool
                {
                    return in_array($id, [
                        PhpSerializerPacker::class,
                        ConfigInterface::class,
                        TranslatorInterface::class,
                    ], true);
                }
            });
        }
    }

    public function testImageEraserRequestRequiresImageUrl(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageEraserRequestDTO([
            'mask_url' => 'https://example.com/mask.png',
        ]);
        $dto->valid();
    }

    public function testImageEraserRequestRequiresMaskUrl(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageEraserRequestDTO([
            'image_url' => 'https://example.com/image.png',
        ]);
        $dto->valid();
    }

    public function testImageEraserRequestRejectsInvalidImageUrl(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageEraserRequestDTO([
            'image_url' => 'not-a-url',
            'mask_url' => 'https://example.com/mask.png',
        ]);
        $dto->valid();
    }

    public function testImageEraserRequestAcceptsValidPayload(): void
    {
        $dto = new ImageEraserRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'generate_config' => [
                'steps' => 30,
                'strength' => 0.8,
                'seed' => 1,
                'dilate_size' => 15,
                'quality' => 'M',
            ],
        ]);

        $dto->valid();

        $this->assertSame('https://example.com/image.png', $dto->getImageUrl());
        $this->assertSame('https://example.com/mask.png', $dto->getMaskUrl());
        $this->assertSame(30, $dto->getSteps());
        $this->assertSame(0.8, $dto->getStrength());
        $this->assertSame(1, $dto->getSeed());
        $this->assertSame(15, $dto->getDilateSize());
        $this->assertSame('M', $dto->getQuality());
    }

    public function testImageEraserRequestAcceptsBase64DataUriInputs(): void
    {
        $image = 'data:image/png;base64,' . base64_encode('image-binary');
        $mask = 'data:image/jpeg;base64,' . base64_encode('mask-binary');

        $dto = new ImageEraserRequestDTO([
            'image_url' => $image,
            'mask_url' => $mask,
        ]);

        $dto->valid();

        $this->assertSame($image, $dto->getImageUrl());
        $this->assertSame($mask, $dto->getMaskUrl());
    }

    public function testImageEraserRequestRejectsInvalidBase64DataUri(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageEraserRequestDTO([
            'image_url' => 'data:image/png;base64,invalid-base64',
            'mask_url' => 'https://example.com/mask.png',
        ]);
        $dto->valid();
    }

    public function testImageEraserRequestRejectsInvalidStrengthAndQuality(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageEraserRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'generate_config' => [
                'strength' => 1.5,
                'quality' => 'X',
            ],
        ]);
        $dto->valid();
    }

    public function testImageEraserRequestRejectsInvalidGenerateConfig(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageEraserRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'generate_config' => 'invalid',
        ]);
        $dto->valid();
    }

    public function testImageEraserRequestRejectsProviderOptionsOutsideGenerateConfig(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageEraserRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'dilate_size' => 15,
        ]);
        $dto->valid();
    }

    public function testImageEraserRequestRejectsInvalidNumericValues(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageEraserRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'steps' => 'abc',
        ]);
        $dto->valid();
    }

    public function testImageEraserRequestRejectsNonPositiveSteps(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageEraserRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'steps' => 0,
        ]);
        $dto->valid();
    }

    public function testImageExpandRequestRequiresImageAndMask(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageExpandRequestDTO([
            'image_url' => 'https://example.com/image.png',
        ]);
        $dto->valid();
    }

    public function testImageExpandRequestAcceptsValidPayload(): void
    {
        $dto = new ImageExpandRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'prompt' => 'expand the background naturally',
            'generate_config' => [
                'steps' => 30,
                'strength' => 0.8,
                'seed' => -1,
                'scale' => 7.0,
                'top' => 0.1,
                'bottom' => 0.1,
                'left' => 0.2,
                'right' => 0.2,
                'max_height' => 1920,
                'max_width' => 1920,
            ],
        ]);

        $dto->valid();

        $this->assertSame('https://example.com/image.png', $dto->getImageUrl());
        $this->assertSame('https://example.com/mask.png', $dto->getMaskUrl());
        $this->assertSame('expand the background naturally', $dto->getPrompt());
        $this->assertSame('expand the background naturally', $dto->getCustomPrompt());
        $this->assertSame(30, $dto->getSteps());
        $this->assertSame(0.8, $dto->getStrength());
        $this->assertSame(7.0, $dto->getScale());
        $this->assertSame(-1, $dto->getSeed());
        $this->assertSame(0.1, $dto->getTop());
        $this->assertSame(0.1, $dto->getBottom());
        $this->assertSame(0.2, $dto->getLeft());
        $this->assertSame(0.2, $dto->getRight());
        $this->assertSame(1920, $dto->getMaxHeight());
        $this->assertSame(1920, $dto->getMaxWidth());
    }

    public function testImageExpandRequestKeepsCustomPromptCompatibility(): void
    {
        $dto = new ImageExpandRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'custom_prompt' => 'legacy prompt',
        ]);

        $dto->valid();

        $this->assertSame('legacy prompt', $dto->getPrompt());
        $this->assertSame('legacy prompt', $dto->getCustomPrompt());
    }

    public function testImageExpandRequestPrefersPromptOverCustomPrompt(): void
    {
        $dto = new ImageExpandRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'prompt' => 'new prompt',
            'custom_prompt' => 'legacy prompt',
        ]);

        $dto->valid();

        $this->assertSame('new prompt', $dto->getPrompt());
        $this->assertSame('new prompt', $dto->getCustomPrompt());
    }

    public function testImageExpandRequestAcceptsBase64DataUriInputs(): void
    {
        $image = 'data:image/webp;base64,' . base64_encode('expand-image-binary');
        $mask = 'data:image/png;base64,' . base64_encode('expand-mask-binary');

        $dto = new ImageExpandRequestDTO([
            'image_url' => $image,
            'mask_url' => $mask,
        ]);

        $dto->valid();

        $this->assertSame($image, $dto->getImageUrl());
        $this->assertSame($mask, $dto->getMaskUrl());
    }

    public function testImageExpandRequestRejectsInvalidRangeValues(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageExpandRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'generate_config' => [
                'scale' => 21,
                'top' => 1.2,
            ],
        ]);
        $dto->valid();
    }

    public function testImageExpandRequestRejectsInvalidGenerateConfig(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageExpandRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'generate_config' => 'invalid',
        ]);
        $dto->valid();
    }

    public function testImageExpandRequestRejectsProviderOptionsOutsideGenerateConfig(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageExpandRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'scale' => 7,
        ]);
        $dto->valid();
    }

    public function testImageExpandRequestRejectsInvalidNumericValues(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageExpandRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'generate_config' => [
                'top' => 'abc',
            ],
        ]);
        $dto->valid();
    }

    public function testImageExpandRequestRejectsNonPositiveSteps(): void
    {
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(MagicApiErrorCode::ValidateFailed->value);

        $dto = new ImageExpandRequestDTO([
            'image_url' => 'https://example.com/image.png',
            'mask_url' => 'https://example.com/mask.png',
            'steps' => -1,
        ]);
        $dto->valid();
    }
}
