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
        if (! Schema::hasTable('magic_super_agent_audio_project')) {
            return;
        }

        if (Schema::hasColumn('magic_super_agent_audio_project', 'extra')) {
            return;
        }

        Schema::table('magic_super_agent_audio_project', static function (Blueprint $table) {
            $table->json('extra')->nullable()->after('phase_error')->comment('音频项目扩展上下文');
        });

        echo 'Added extra column to magic_super_agent_audio_project table' . PHP_EOL;
    }

    public function down(): void
    {
    }
};
