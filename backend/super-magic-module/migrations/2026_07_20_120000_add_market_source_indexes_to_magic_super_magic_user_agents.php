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
        // Schema migration 只负责结构变更；历史数据修正由
        // super-magic:migrate-organization-shared-agents Command 单独执行。
        if (Schema::hasTable('magic_super_magic_agent_market')) {
            Schema::table('magic_super_magic_agent_market', static function (Blueprint $table) {
                $table->string('organization_code', 64)->nullable()->change();
            });
        }

        if (! Schema::hasTable('magic_super_magic_user_agents')) {
            return;
        }

        Schema::table('magic_super_magic_user_agents', static function (Blueprint $table) {
            if (! Schema::hasIndex('magic_super_magic_user_agents', 'idx_org_source_user')) {
                // 组织共享范围缩小时，按 market source 精确查询并撤销雇佣关系。
                $table->index(
                    ['organization_code', 'source_type', 'source_id', 'user_id'],
                    'idx_org_source_user'
                );
            }
        });
    }

    public function down(): void
    {
    }
};
