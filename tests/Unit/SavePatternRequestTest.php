<?php

use App\Http\Requests\SavePatternRequest;

it('accepts a document within the size cap', function () {
    $rule = (new SavePatternRequest)->rules()['document'][3];
    $failures = [];

    $rule('document', ['schema' => 'sewcraft.pattern/0.2', 'units' => 'mm'], function (string $message) use (&$failures) {
        $failures[] = $message;
    });

    expect($failures)->toBe([]);
});

it('rejects a document larger than two megabytes', function () {
    $rule = (new SavePatternRequest)->rules()['document'][3];
    $failures = [];

    $rule('document', ['blob' => str_repeat('a', 2 * 1024 * 1024)], function (string $message) use (&$failures) {
        $failures[] = $message;
    });

    expect($failures)->toBe(['The document may not be greater than 2 MB.']);
});

it('rejects a document that cannot be serialised', function () {
    $rule = (new SavePatternRequest)->rules()['document'][3];
    $failures = [];

    $rule('document', ['blob' => "\xB1"], function (string $message) use (&$failures) {
        $failures[] = $message;
    });

    expect($failures)->toBe(['The document may not be greater than 2 MB.']);
});
