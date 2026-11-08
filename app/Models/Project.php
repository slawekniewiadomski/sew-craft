<?php

namespace App\Models;

use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    /** @use HasFactory<ProjectFactory> */
    use HasFactory;

    /** The number of projects one account may own. */
    public const MAX_PER_USER = 3;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'description',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return HasMany<Pattern, $this>
     */
    public function patterns(): HasMany
    {
        return $this->hasMany(Pattern::class);
    }
}
