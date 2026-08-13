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
        if (Schema::hasTable('magic_super_agent_micro_apps')) {
            return;
        }

        Schema::create('magic_super_agent_micro_apps', function (Blueprint $table) {
            $table->bigInteger('id')->primary()->comment('主键ID');
            $table->bigInteger('project_id')->unique('uk_project_id')->comment('微应用项目ID');
            $table->string('resource_id', 64)->unique('uk_resource_id')->comment('稳定分享资源ID');
            $table->bigInteger('share_id')->nullable()->comment('分享ID');
            $table->string('share_code', 64)->nullable()->comment('分享码');
            $table->string('organization_code', 64)->index('idx_organization_code')->comment('组织编码');
            $table->string('user_id', 64)->comment('首次发布用户ID');
            $table->unsignedTinyInteger('share_type')->comment('分享方式：2团队内，4公开，5密码');
            $table->string('share_range', 32)->nullable()->comment('团队分享范围：all/designated');
            $table->json('target_ids')->nullable()->comment('指定成员/部门');
            $table->string('publish_status', 32)->index('idx_publish_status')->comment('published/unpublished');
            $table->text('access_url')->nullable()->comment('访问链接，不携带密码 query');
            $table->dateTime('published_at')->nullable()->comment('发布时间');
            $table->dateTime('unpublished_at')->nullable()->comment('下架时间');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['organization_code', 'publish_status'], 'idx_org_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('magic_super_agent_micro_apps');
    }
};
