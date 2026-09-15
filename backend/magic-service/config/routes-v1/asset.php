<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Infrastructure\Util\Middleware\RequestContextMiddleware;
use App\Interfaces\Asset\Facade\AssetApi;
use App\Interfaces\Middleware\Auth\UserAuthMiddleware;
use Hyperf\HttpServer\Router\Router;

Router::addGroup('/api/v1/assets', static function (): void {
    Router::post('', [AssetApi::class, 'create']);
    Router::post('/library', [AssetApi::class, 'saveToLibrary']);
    Router::get('', [AssetApi::class, 'list']);
    Router::get('/{assetId:\d+}', [AssetApi::class, 'detail']);
    Router::delete('/{assetId:\d+}', [AssetApi::class, 'delete']);
}, ['middleware' => [RequestContextMiddleware::class, UserAuthMiddleware::class]]);

Router::post('/api/v1/asset-agreements', [AssetApi::class, 'signAgreement'], [
    'middleware' => [RequestContextMiddleware::class, UserAuthMiddleware::class],
]);
