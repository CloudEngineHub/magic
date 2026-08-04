<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Command\CustomMigrateCommand;
use Hyperf\Database\Commands\Migrations\InstallCommand;

return [
    // 注册自定义迁移命令，保留 AUTO_MIGRATION 环境变量控制能力
    CustomMigrateCommand::class,
    // 仅注册迁移表初始化命令，避免暴露重置、回滚等高风险数据库命令
    InstallCommand::class,
];
