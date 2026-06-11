<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\ImageOperation;

use App\Domain\ModelGateway\Entity\ValueObject\ImageInput;
use App\Infrastructure\ExternalAPI\ImageEraser\Driver\VolcengineImageEraserDriver;
use App\Infrastructure\ExternalAPI\ImageEraser\Driver\VolcengineJimengImageEraserDriver;
use App\Infrastructure\ExternalAPI\ImageEraser\DTO\ImageEraserDriverRequest;
use App\Infrastructure\ExternalAPI\ImageExpand\Driver\VolcengineImageExpandDriver;
use App\Infrastructure\ExternalAPI\ImageExpand\Driver\VolcengineJimengImageExpandDriver;
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

    public function testJimengEraserBuildsOfficialInpaintingPayload(): void
    {
        $driver = (new ReflectionClass(VolcengineJimengImageEraserDriver::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(VolcengineJimengImageEraserDriver::class, 'buildSubmitBody');

        $body = $method->invoke($driver, new ImageEraserDriverRequest(
            ImageInput::fromUrl('https://example.com/image.png'),
            ImageInput::fromUrl('https://example.com/mask.png'),
            null,
            null,
            123,
            null,
            null,
        ), '删除', null);

        $this->assertSame('jimeng_image2image_dream_inpaint', $body['req_key']);
        $this->assertSame(['https://example.com/image.png', 'https://example.com/mask.png'], $body['image_urls']);
        $this->assertArrayNotHasKey('binary_data_base64', $body);
        $this->assertSame('删除', $body['prompt']);
        $this->assertSame(123, $body['seed']);
        $this->assertArrayNotHasKey('steps', $body);
        $this->assertArrayNotHasKey('strength', $body);
        $this->assertArrayNotHasKey('dilate_size', $body);
        $this->assertArrayNotHasKey('quality', $body);
    }

    public function testJimengEraserBuildsBase64Payload(): void
    {
        $imageBase64 = base64_encode('jimeng-eraser-image');
        $maskBase64 = base64_encode('jimeng-eraser-mask');

        $driver = (new ReflectionClass(VolcengineJimengImageEraserDriver::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(VolcengineJimengImageEraserDriver::class, 'buildSubmitBody');

        $body = $method->invoke($driver, new ImageEraserDriverRequest(
            ImageInput::fromDataUri('data:image/png;base64,' . $imageBase64),
            ImageInput::fromDataUri('data:image/png;base64,' . $maskBase64),
            null,
            null,
            null,
            null,
            null,
        ), '删除', null);

        $this->assertSame('jimeng_image2image_dream_inpaint', $body['req_key']);
        $this->assertSame([$imageBase64, $maskBase64], $body['binary_data_base64']);
        $this->assertArrayNotHasKey('image_urls', $body);
        $this->assertSame('删除', $body['prompt']);
        $this->assertArrayNotHasKey('seed', $body);
    }

    public function testJimengExpandBuildsOfficialCanvasOutpaintingPayload(): void
    {
        $driver = (new ReflectionClass(VolcengineJimengImageExpandDriver::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(VolcengineJimengImageExpandDriver::class, 'buildSubmitBody');

        $body = $method->invoke($driver, new ImageExpandDriverRequest(
            ImageInput::fromUrl('https://example.com/canvas.png'),
            ImageInput::fromUrl('https://example.com/mask.png'),
            'extend naturally',
            null,
            null,
            7.0,
            -1,
            0.1,
            0.1,
            0.2,
            0.2,
            1920,
            1920,
        ), null);

        $this->assertSame('jimeng_img2img_seed3_painting_edit', $body['req_key']);
        $this->assertSame(['https://example.com/canvas.png', 'https://example.com/mask.png'], $body['image_urls']);
        $this->assertArrayNotHasKey('binary_data_base64', $body);
        $this->assertSame('extend naturally', $body['prompt']);
        $this->assertSame(-1, $body['seed']);
        $this->assertArrayNotHasKey('top', $body);
        $this->assertArrayNotHasKey('bottom', $body);
        $this->assertArrayNotHasKey('left', $body);
        $this->assertArrayNotHasKey('right', $body);
        $this->assertArrayNotHasKey('scale', $body);
        $this->assertArrayNotHasKey('max_height', $body);
        $this->assertArrayNotHasKey('max_width', $body);
    }

    public function testJimengExpandBuildsBase64Payload(): void
    {
        $imageBase64 = base64_encode('jimeng-expand-canvas');
        $maskBase64 = base64_encode('jimeng-expand-mask');

        $driver = (new ReflectionClass(VolcengineJimengImageExpandDriver::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(VolcengineJimengImageExpandDriver::class, 'buildSubmitBody');

        $body = $method->invoke($driver, new ImageExpandDriverRequest(
            ImageInput::fromDataUri('data:image/png;base64,' . $imageBase64),
            ImageInput::fromDataUri('data:image/png;base64,' . $maskBase64),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
        ), 'configured prompt');

        $this->assertSame('jimeng_img2img_seed3_painting_edit', $body['req_key']);
        $this->assertSame([$imageBase64, $maskBase64], $body['binary_data_base64']);
        $this->assertArrayNotHasKey('image_urls', $body);
        $this->assertSame('configured prompt', $body['prompt']);
        $this->assertArrayNotHasKey('seed', $body);
    }
}
