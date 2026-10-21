<?php

it('exposes the command spec', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('version', '0.8.0')
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
        ->assertJsonPath('commands.add_constraint.params.value', 'number?')
        ->assertJsonPath('commands.update_constraint.params.id', 'entity_id')
        ->assertJsonPath('commands.update_constraint.params.value', 'number|null?')
        ->assertJsonPath('commands.update_constraint.inverse', 'update_constraint');
});

it('exposes the seam allowance update command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_seam_allowance.params.side', 'left|right?')
        ->assertJsonPath('commands.set_seam_allowance.params.id', 'entity_id')
        ->assertJsonPath('commands.set_seam_allowance.params.width', 'number?')
        ->assertJsonPath('commands.set_seam_allowance.params.side', 'left|right?')
        ->assertJsonPath('commands.set_seam_allowance.inverse', 'set_seam_allowance');
});

it('exposes the construction commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_construction_line.params.start', 'entity_id')
        ->assertJsonPath('commands.set_construction.params.construction', 'bool')
        ->assertJsonPath('commands.set_construction.inverse', 'set_construction');
});

it('exposes the corner round commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_corner_round.params.first', 'entity_id')
        ->assertJsonPath('commands.add_corner_round.params.second', 'entity_id')
        ->assertJsonPath('commands.add_corner_round.params.radius', 'number')
        ->assertJsonPath('commands.add_corner_round.inverse', 'remove_corner_round')
        ->assertJsonPath('commands.set_corner_round_radius.params.id', 'entity_id')
        ->assertJsonPath('commands.set_corner_round_radius.params.radius', 'number')
        ->assertJsonPath('commands.set_corner_round_radius.inverse', 'set_corner_round_radius')
        ->assertJsonPath('commands.remove_corner_round.params.id', 'entity_id')
        ->assertJsonPath('commands.remove_corner_round.inverse', 'add_corner_round');
});

it('exposes the circle command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_circle.params.center', 'entity_id')
        ->assertJsonPath('commands.add_circle.params.rim', 'entity_id')
        ->assertJsonPath('commands.add_circle.params.construction', 'bool?')
        ->assertJsonPath('commands.add_circle.inverse', 'delete_entity');
});
