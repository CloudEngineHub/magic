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
        if (Schema::hasTable('magic_resource_access_logs')) {
            return;
        }

        Schema::create('magic_resource_access_logs', static function (Blueprint $table): void {
            $table->bigIncrements('id')->comment('主键 ID');
            $table->string('organization_code', 64)->default('')->comment('访问者所属组织编码');
            $table->string('user_id', 64)->default('')->comment('访问者用户 ID');
            $table->string('user_name', 255)->default('')->comment('访问者名称');
            $table->string('actor_type', 32)->default('user')->comment('访问主体类型：user/tool/system');
            $table->string('resource_type', 64)->comment('资源类型，如 slides_template');
            $table->string('resource_code', 128)->comment('资源唯一编码');
            $table->string('resource_name', 255)->nullable()->comment('资源名称');
            $table->string('operation', 64)->comment('访问动作，如 get_file_url/download/view/use');
            $table->string('source', 64)->default('')->comment('访问来源，如 api/super_magic_tool');
            $table->string('request_id', 128)->nullable()->comment('请求 ID');
            $table->json('context')->nullable()->comment('业务上下文，如 topic_id/project_id/task_id/tool_call_id');
            $table->timestamps();

            $table->index(['organization_code', 'created_at'], 'idx_org_created_at');
            $table->index(['user_id', 'created_at'], 'idx_user_created_at');
            $table->index(['resource_type', 'resource_code', 'operation'], 'idx_resource_operation');
            $table->index(['source', 'created_at'], 'idx_source_created_at');
            $table->index('request_id', 'idx_request_id');
            $table->comment('通用资源访问日志表');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('magic_resource_access_logs');
    }
};
