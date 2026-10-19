<?php

it('exposes the command spec', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('version', '0.3.0')
        ->assertJsonStructure([
            'version',
            'commands' => [
                'add_point',
                'add_constraint',
                'solve',
            ],
        ]);
});

it('exposes dimension presentation and update params', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_constraint.params.orientation', 'aligned|horizontal|vertical?')
        ->assertJsonPath('commands.add_constraint.params.offset', 'number?')
        ->assertJsonPath('commands.update_constraint.params.id', 'entity_id')
        ->assertJsonPath('commands.update_constraint.inverse', 'update_constraint');
});

it('exposes the construction commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_construction_line.params.start', 'entity_id')
        ->assertJsonPath('commands.set_construction.params.construction', 'bool')
        ->assertJsonPath('commands.set_construction.inverse', 'set_construction');
});
