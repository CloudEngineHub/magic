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
        if (Schema::hasTable('magic_super_agent_sandbox_keep_alive_topics')) {
            return;
        }

        Schema::create('magic_super_agent_sandbox_keep_alive_topics', function (Blueprint $table) {
            $table->bigInteger('id')->primary()->comment('保活记录ID（雪花ID）');
            $table->string('user_id', 128)->comment('用户ID');
            $table->string('organization_code', 64)->comment('组织代码');
            $table->bigInteger('project_id')->unsigned()->comment('项目ID');
            $table->bigInteger('topic_id')->unsigned()->comment('话题ID');
            $table->string('sandbox_id', 128)->comment('沙箱ID');
            $table->tinyInteger('is_enabled')->default(1)->comment('是否启用：0-否，1-是');
            $table->timestamp('last_checked_at')->nullable()->comment('上次检测时间');
            $table->timestamp('last_keepalive_at')->nullable()->comment('上次保活成功时间');
            $table->timestamp('last_restarted_at')->nullable()->comment('上次重新拉起时间');
            $table->string('last_status', 64)->nullable()->comment('上次沙箱状态');
            $table->integer('failure_count')->default(0)->comment('连续失败次数');
            $table->string('last_error', 500)->nullable()->comment('最近一次错误信息');
            $table->timestamp('deleted_at')->nullable()->comment('删除时间');
            $table->timestamps();

            $table->unique('topic_id', 'uniq_topic_id');
            $table->index(['is_enabled', 'last_checked_at', 'deleted_at'], 'idx_scan');
            $table->index(['user_id', 'project_id'], 'idx_user_project');
        });
    }

    public function down(): void
    {
    }
};
