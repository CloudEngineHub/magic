<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('magic_super_agent_message')) {
            return;
        }

        if (! Schema::hasIndex('magic_super_agent_message', 'idx_topic_show_deleted_id')) {
            Db::statement(
                'ALTER TABLE magic_super_agent_message '
                . 'ADD INDEX idx_topic_show_deleted_id '
                . '(topic_id, show_in_ui, deleted_at, id), '
                . 'ALGORITHM=INPLACE, LOCK=NONE'
            );
        }

        if (Schema::hasIndex('magic_super_agent_message', 'idx_topic_show_deleted')) {
            Db::statement(
                'ALTER TABLE magic_super_agent_message '
                . 'DROP INDEX idx_topic_show_deleted, '
                . 'ALGORITHM=INPLACE, LOCK=NONE'
            );
        }
    }

    public function down(): void
    {
    }
};
