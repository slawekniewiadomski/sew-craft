<?php

namespace Database\Factories;

use App\Models\Pattern;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Pattern>
 */
class PatternFactory extends Factory
{
    protected $model = Pattern::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'geometry' => null,
        ];
    }
}
