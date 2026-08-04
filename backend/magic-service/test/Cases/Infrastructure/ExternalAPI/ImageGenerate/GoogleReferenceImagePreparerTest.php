<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\ImageGenerate;

use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\Google\GoogleReferenceImagePreparer;
use Exception;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
final class GoogleReferenceImagePreparerTest extends TestCase
{
    public function testConvertsDataUriToInlineData(): void
    {
        $preparer = new GoogleReferenceImagePreparer();
        $dataUri = 'data:image/png;base64,' . base64_encode('reference-image');

        $this->assertSame([
            [
                'type' => 'base64',
                'mimeType' => 'image/png',
                'data' => base64_encode('reference-image'),
            ],
        ], $preparer->prepare([$dataUri]));
    }

    public function testRejectsReferenceImageLargerThanSixtyMib(): void
    {
        $preparer = new GoogleReferenceImagePreparer();
        $method = (new ReflectionClass($preparer))->getMethod('assertImageSize');
        $method->setAccessible(true);
        $totalBytes = 0;
        $size = 60 * 1024 * 1024 + 1;

        $this->expectException(Exception::class);
        $method->invokeArgs($preparer, [$size, &$totalBytes]);
    }

    public function testRejectsReferenceImagesLargerThanSixtyMibInTotal(): void
    {
        $preparer = new GoogleReferenceImagePreparer();
        $method = (new ReflectionClass($preparer))->getMethod('assertImageSize');
        $method->setAccessible(true);
        $totalBytes = 60 * 1024 * 1024;
        $size = 1;

        $this->expectException(Exception::class);
        $method->invokeArgs($preparer, [$size, &$totalBytes]);
    }
}
