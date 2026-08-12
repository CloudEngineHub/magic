<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Unit\SuperMagic;

use App\Infrastructure\SuperMagic\Utils\FileDownloadUrlHelper;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class FileDownloadUrlHelperTest extends TestCase
{
    public function testPreviewUrlOptionsDisableDownload(): void
    {
        $options = FileDownloadUrlHelper::prepareFileUrlOptions('text.css', 'preview');

        $this->assertFalse($options['download']);
    }

    public function testInlineUrlOptionsDisableDownload(): void
    {
        $options = FileDownloadUrlHelper::prepareFileUrlOptions('text.css', 'inline');

        $this->assertFalse($options['download']);
    }

    public function testDownloadUrlOptionsDoNotSpecifyDownloadFlag(): void
    {
        $options = FileDownloadUrlHelper::prepareFileUrlOptions('text.css', 'download');

        $this->assertArrayNotHasKey('download', $options);
    }
}
