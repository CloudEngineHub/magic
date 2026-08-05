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
        if (! Schema::hasTable('magic_recycle_bin')) {
            return;
        }

        Schema::table('magic_recycle_bin', function (Blueprint $table) {
            if (! Schema::hasIndex('magic_recycle_bin', 'idx_recycle_owner_removed_deleted')) {
                $table->index(
                    ['owner_id', 'removed_at', 'deleted_at'],
                    'idx_recycle_owner_removed_deleted'
                );
            }
        });
    }

    public function down(): void
    {
    }
};
