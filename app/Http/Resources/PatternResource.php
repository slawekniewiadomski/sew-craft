<?php

namespace App\Http\Resources;

use App\Services\PatternSnapshot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin PatternSnapshot
 */
class PatternResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'project_id' => $this->projectId,
            'document' => $this->document,
            'version' => $this->version,
            'saved_at' => $this->savedAt?->toIso8601ZuluString(),
        ];
    }
}
