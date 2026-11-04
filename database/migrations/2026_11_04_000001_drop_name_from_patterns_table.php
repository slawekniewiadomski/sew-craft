<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The project name is the only pattern name; the copy stored here is
     * redundant and could drift after a rename.
     */
    public function up(): void
    {
        Schema::table('patterns', function (Blueprint $table) {
            $table->dropColumn('name');
        });
    }

    /**
     * Reconstruct the dropped column from the current project names. Renames
     * made after this migration cannot be recovered, so the restored value is
     * the best available approximation rather than a byte-for-byte rollback.
     */
    public function down(): void
    {
        Schema::table('patterns', function (Blueprint $table) {
            $table->string('name')->nullable();
        });

        DB::statement(
            'update patterns set name = (select name from projects where projects.id = patterns.project_id)'
        );
    }
};
