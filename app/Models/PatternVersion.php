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
    ];

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
