<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('magicbase_project_storage_routes')) {
            return;
        }

        Schema::create('magicbase_project_storage_routes', static function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary()->comment('路由ID');
            $table->string('organization_code', 64)->comment('组织编码');
            $table->unsignedBigInteger('project_id')->comment('项目ID');
            $table->string('storage_driver', 32)->default('mongodb')->comment('行存储驱动');
            $table->string('mongo_database', 128)->default('')->comment('MongoDB database');
            $table->string('mongo_collection', 128)->default('')->comment('MongoDB collection');
            $table->unsignedInteger('shard_id')->default(0)->comment('固定 collection 池编号');
            $table->string('status', 32)->default('active')->comment('状态');
            $table->dateTime('created_at')->comment('创建时间');
            $table->dateTime('updated_at')->comment('更新时间');
            $table->unique(['organization_code', 'project_id'], 'uk_magicbase_project_storage_route');
            $table->index(['storage_driver', 'mongo_database', 'mongo_collection', 'status'], 'idx_magicbase_storage_route_collection');
            $table->comment('MagicBase 项目行存储路由');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('magicbase_project_storage_routes');
    }
};
