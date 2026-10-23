<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SavePatternRequest extends FormRequest
{
    /**
     * The document is stored as opaque JSON, so only its envelope is checked:
     * a schema string, millimetre units and the size cap.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'document' => [
                'bail',
                'required',
                'array',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    $encoded = json_encode($value);

                    if ($encoded === false || strlen($encoded) > 2 * 1024 * 1024) {
                        $fail('The document may not be greater than 2 MB.');
                    }
                },
            ],
            'document.schema' => ['required', 'string'],
            'document.units' => ['required', 'in:mm'],
            'expected_version' => ['nullable', 'integer', 'min:0'],
            'expected_schema' => ['nullable', 'string'],
        ];
    }
}
