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
        Schema::table('magic_modes', function (Blueprint $table) {
            $table->tinyInteger('is_system_default_agent')
                ->default(0)
                ->comment('是否为系统默认数字员工 0:否 1:是')
                ->after('is_default');
            $table->index(
                ['organization_code', 'is_system_default_agent'],
                'idx_org_system_default_agent'
            );
        });
    }

    public function down(): void
    {
    }
};
