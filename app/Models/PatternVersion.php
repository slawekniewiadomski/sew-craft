<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PatternVersion extends Model
{
    public const UPDATED_AT = null;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'pattern_id',
        'version',
        'geometry',
        'origin',
    ];

    /** A checkpoint written by an explicit Save or an upgrade archive. */
    public const ORIGIN_MANUAL = 'manual';

    /** A background write; only the newest autosave row per pattern is kept. */
    public const ORIGIN_AUTOSAVE = 'autosave';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'geometry' => 'array',
        ];
    }

    /**
     * @return BelongsTo<Pattern, $this>
     */
    public function pattern(): BelongsTo
    {
        return $this->belongsTo(Pattern::class);
    }
}
