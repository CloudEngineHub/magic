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
        if (! Schema::hasTable('magic_super_magic_agent_market')
            || Schema::hasIndex('magic_super_magic_agent_market', 'idx_org_agent_market_lookup')) {
            return;
        }

        Schema::table('magic_super_magic_agent_market', static function (Blueprint $table) {
            // 协作员工 code 先精确换算为市场 ID，避免主列表新增 agent_code OR 条件。
            $table->index(
                ['organization_code', 'agent_code', 'market_type', 'publish_status', 'is_hidden'],
                'idx_org_agent_market_lookup'
            );
        });
    }

    public function down(): void
    {
    }
};
