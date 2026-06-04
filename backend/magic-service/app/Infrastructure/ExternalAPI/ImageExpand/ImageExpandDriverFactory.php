<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageExpand;

use App\Infrastructure\ExternalAPI\ImageExpand\Driver\OfficialProxyImageExpandDriver;
use App\Infrastructure\ExternalAPI\ImageExpand\Driver\VolcengineImageExpandDriver;
use App\Infrastructure\Util\File\ImageFileInspector;
use Hyperf\Logger\LoggerFactory;
use InvalidArgumentException;

class ImageExpandDriverFactory
{
    public const PROVIDER_OFFICIAL_PROXY = 'official_proxy';

    public const PROVIDER_VOLCENGINE = 'volcengine';

    public function __construct(
        private readonly ImageFileInspector $imageFileInspector,
        private readonly LoggerFactory $loggerFactory,
    ) {
    }

    /**
     * @param array<string, mixed> $providerConfig
     */
    public function create(string $providerCode, array $providerConfig): ImageExpandDriverInterface
    {
        return match ($providerCode) {
            self::PROVIDER_OFFICIAL_PROXY => new OfficialProxyImageExpandDriver($providerConfig, $this->imageFileInspector, $this->loggerFactory),
            self::PROVIDER_VOLCENGINE => new VolcengineImageExpandDriver($providerConfig, $this->imageFileInspector, $this->loggerFactory),
            default => throw new InvalidArgumentException("Unsupported image expand provider: {$providerCode}"),
        };
    }
}
