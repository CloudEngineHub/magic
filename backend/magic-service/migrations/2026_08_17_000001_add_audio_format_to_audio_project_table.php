<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('magic_super_agent_audio_project')) {
            return;
        }

        if (! Schema::hasColumn('magic_super_agent_audio_project', 'audio_format')) {
            Schema::table('magic_super_agent_audio_project', static function (Blueprint $table): void {
                $table->string('audio_format', 16)
                    ->nullable()
                    ->after('audio_source')
                    ->comment('Audio format; recorded tasks use wav/opus, imported files keep their extension');
            });
        }

        // Existing recorded tasks predate OGG support and are WAV tasks.
        Db::table('magic_super_agent_audio_project')
            ->where('audio_source', 'recorded')
            ->whereNull('audio_format')
            ->update(['audio_format' => 'wav']);

        // Imported projects retain the actual extension of their primary file.
        if (! Schema::hasTable('magic_super_agent_task_files')) {
            return;
        }

        $rows = Db::table('magic_super_agent_audio_project as a')
            ->join('magic_super_agent_task_files as f', 'a.audio_file_id', '=', 'f.file_id')
            ->where('a.audio_source', 'imported')
            ->whereNull('a.audio_format')
            ->whereNotNull('f.file_extension')
            ->where('f.file_extension', '<>', '')
            ->select(['a.project_id', 'f.file_extension'])
            ->get();

        foreach ($rows as $row) {
            $format = strtolower(ltrim(trim((string) $row->file_extension), '.'));
            if ($format === '' || ! preg_match('/^[a-z0-9]{1,16}$/', $format)) {
                continue;
            }

            Db::table('magic_super_agent_audio_project')
                ->where('project_id', (int) $row->project_id)
                ->whereNull('audio_format')
                ->update(['audio_format' => $format]);
        }
    }

    public function down(): void
    {

    }
};
