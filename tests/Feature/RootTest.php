<?php

it('returns the api banner', function () {
    $this->get('/')
        ->assertOk()
        ->assertJson([
            'app' => 'SewCraft',
            'api' => '/api',
        ]);
});
