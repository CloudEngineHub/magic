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
        if (! Schema::hasTable('magic_super_magic_agent_market')) {
            return;
        }

        Schema::table('magic_super_magic_agent_market', static function (Blueprint $table) {
            // 存量保持 NULL，由应用层按版本类型安全兼容，后续任务再统一回填。
            if (! Schema::hasColumn('magic_super_magic_agent_market', 'market_type')) {
                $table->string('market_type', 32)
                    ->nullable()
                    ->after('organization_code')
                    ->comment('市场类型：MARKET=公共市场，ORGANIZATION=组织内市场');
            }

            if (! Schema::hasIndex('magic_super_magic_agent_market', 'idx_market_type_status_hidden')) {
                $table->index(['market_type', 'publish_status', 'is_hidden'], 'idx_market_type_status_hidden');
            }
        });
    }

    public function down(): void
    {
    }
};
