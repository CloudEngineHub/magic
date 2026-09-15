<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasTable('magic_super_agent_audio_project')) {
            return;
        }

        if (Schema::hasColumn('magic_super_agent_audio_project', 'location')) {
            return;
        }

        Schema::table('magic_super_agent_audio_project', function (Blueprint $table) {
            $table->string('location', 500)->nullable()->comment('Recording location')->after('file_size');
        });

        echo 'Added location column to magic_super_agent_audio_project table' . PHP_EOL;
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
    }
};
