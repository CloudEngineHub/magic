<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\ImageOperation;

use App\Domain\ModelGateway\Entity\ValueObject\ImageInput;
use App\Infrastructure\ExternalAPI\ImageEraser\Driver\VolcengineImageEraserDriver;
use App\Infrastructure\ExternalAPI\ImageEraser\DTO\ImageEraserDriverRequest;
use App\Infrastructure\ExternalAPI\ImageExpand\Driver\VolcengineImageExpandDriver;
use App\Infrastructure\ExternalAPI\ImageExpand\DTO\ImageExpandDriverRequest;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * @internal
 */
class VolcengineImageOperationPayloadTest extends TestCase
{
    public function testEraserBuildsUrlPayload(): void
    {
        $driver = (new ReflectionClass(VolcengineImageEraserDriver::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(VolcengineImageEraserDriver::class, 'buildSubmitBody');

        $body = $method->invoke($driver, new ImageEraserDriverRequest(
            ImageInput::fromUrl('https://example.com/image.png'),
            ImageInput::fromUrl('https://example.com/mask.png'),
            30,
            0.8,
            1,
            15,
            'M',
        ));

        $this->assertSame('i2i_inpainting', $body['req_key']);
        $this->assertSame(['https://example.com/image.png', 'https://example.com/mask.png'], $body['image_urls']);
        $this->assertArrayNotHasKey('binary_data_base64', $body);
        $this->assertSame(30, $body['steps']);
        $this->assertSame(0.8, $body['strength']);
        $this->assertSame(1, $body['seed']);
        $this->assertSame(15, $body['dilate_size']);
        $this->assertSame('M', $body['quality']);
    }

    public function testEraserBuildsBase64Payload(): void
    {
        $imageBase64 = base64_encode('image-binary');
        $maskBase64 = base64_encode('mask-binary');

        $driver = (new ReflectionClass(VolcengineImageEraserDriver::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(VolcengineImageEraserDriver::class, 'buildSubmitBody');

        $body = $method->invoke($driver, new ImageEraserDriverRequest(
            ImageInput::fromDataUri('data:image/png;base64,' . $imageBase64),
            ImageInput::fromDataUri('data:image/png;base64,' . $maskBase64),
            null,
            null,
            null,
            null,
            null,
        ));

        $this->assertSame('i2i_inpainting', $body['req_key']);
        $this->assertSame([$imageBase64, $maskBase64], $body['binary_data_base64']);
        $this->assertArrayNotHasKey('image_urls', $body);
    }

    public function testExpandBuildsBase64PayloadWithPromptAndGenerateConfig(): void
    {
        $imageBase64 = base64_encode('expand-image-binary');
        $maskBase64 = base64_encode('expand-mask-binary');

        $driver = (new ReflectionClass(VolcengineImageExpandDriver::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(VolcengineImageExpandDriver::class, 'buildSubmitBody');

        $body = $method->invoke($driver, new ImageExpandDriverRequest(
            ImageInput::fromDataUri('data:image/webp;base64,' . $imageBase64),
            ImageInput::fromDataUri('data:image/png;base64,' . $maskBase64),
            'expand naturally',
            30,
            0.8,
            7.0,
            -1,
            0.1,
            0.1,
            0.2,
            0.2,
            1920,
            1920,
        ));

        $this->assertSame('i2i_outpainting', $body['req_key']);
        $this->assertSame([$imageBase64, $maskBase64], $body['binary_data_base64']);
        $this->assertArrayNotHasKey('image_urls', $body);
        $this->assertSame('expand naturally', $body['custom_prompt']);
        $this->assertSame(30, $body['steps']);
        $this->assertSame(0.8, $body['strength']);
        $this->assertSame(7.0, $body['scale']);
        $this->assertSame(-1, $body['seed']);
        $this->assertSame(0.1, $body['top']);
        $this->assertSame(0.1, $body['bottom']);
        $this->assertSame(0.2, $body['left']);
        $this->assertSame(0.2, $body['right']);
        $this->assertSame(1920, $body['max_height']);
        $this->assertSame(1920, $body['max_width']);
    }
}
