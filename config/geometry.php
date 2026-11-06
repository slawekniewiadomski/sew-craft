<?php

/*
|--------------------------------------------------------------------------
| Geometry Contract
|--------------------------------------------------------------------------
|
| The command contract is authored once, in the machine-readable spec at
| docs/domain/command-spec.json, and exposed at GET /api/commands so agents and
| the SPA can discover it at runtime.
|
| This file reads that spec instead of restating it: a second hand-maintained
| copy is how the PHP array and the JSON drifted apart before. A missing or
| malformed spec is a deployment error, so it fails loudly at boot.
|
*/

$specPath = __DIR__.'/../docs/domain/command-spec.json';
$spec = json_decode((string) file_get_contents($specPath), true, flags: JSON_THROW_ON_ERROR);

return [

    'spec_version' => $spec['spec_version'],

    /*
    | All geometry is stored in millimetres as float values. Display units are a
    | presentation concern handled by the frontend.
    */
    'units' => $spec['units'],

    'commands' => $spec['commands'],

];
