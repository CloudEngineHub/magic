<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Infrastructure\Util\Middleware\RequestContextMiddleware;
use App\Interfaces\Admin\SuperMagic\Agent\AdminSuperMagicAgentApi;
use App\Interfaces\Admin\SuperMagic\Agent\AdminSuperMagicCategoryApi;
use App\Interfaces\Admin\SuperMagic\Skill\AdminSkillApi;
use Hyperf\HttpServer\Router\Router;

Router::addGroup('/api/v2/admin', static function () {
    Router::addGroup('/super-magic/agents', static function () {
        Router::addGroup('/categories', static function () {
            Router::post('/queries', [AdminSuperMagicCategoryApi::class, 'queries']);
            Router::post('', [AdminSuperMagicCategoryApi::class, 'create']);
            Router::get('/{id:\d+}', [AdminSuperMagicCategoryApi::class, 'show']);
            Router::put('/{id:\d+}', [AdminSuperMagicCategoryApi::class, 'update']);
            Router::delete('/{id:\d+}', [AdminSuperMagicCategoryApi::class, 'delete']);
        });

        Router::addGroup('/versions', static function () {
            Router::post('/queries', [AdminSuperMagicAgentApi::class, 'queryVersions']);
            Router::put('/{id}/review', [AdminSuperMagicAgentApi::class, 'reviewAgentVersion']);
        });

        Router::addGroup('/markets', static function () {
            Router::post('/queries', [AdminSuperMagicAgentApi::class, 'queryMarkets']);
            Router::put('/{id}', [AdminSuperMagicAgentApi::class, 'updateMarket']);
            Router::put('/{id}/category', [AdminSuperMagicAgentApi::class, 'updateMarketCategory']);
            Router::put('/{id}/sort-order', [AdminSuperMagicAgentApi::class, 'updateMarketSortOrder']);
        });

        Router::get('/{code}', [AdminSuperMagicAgentApi::class, 'getDetailByCode']);
    });
}, ['middleware' => [RequestContextMiddleware::class]]);

Router::addGroup('/api/v1/admin', static function () {
    // Admin 路由组
    Router::addGroup('/skills', static function () {
        Router::post('/versions/queries', [AdminSkillApi::class, 'queryVersions']);
        Router::post('/markets/queries', [AdminSkillApi::class, 'queryMarkets']);
        Router::put('/markets/{id}', [AdminSkillApi::class, 'updateMarket']);
        Router::put('/markets/{id}/sort-order', [AdminSkillApi::class, 'updateMarketSortOrder']);
        Router::put('/markets/{id}/offline', [AdminSkillApi::class, 'offlineMarket']);
        Router::put('/versions/{id}/review', [AdminSkillApi::class, 'reviewSkillVersion']);
    });
}, ['middleware' => [RequestContextMiddleware::class]]);
