process.on('uncaughtException', function(err) {
    console.log('Caught exception: ' + err);
    console.log(err.stack);
});


// http
var http = require('http');
var server = http.createServer();
var port = parseInt(process.env.TANX_PORT || '30043', 10) || 30043;
var host = process.env.TANX_HOST || '0.0.0.0';
server.listen(port, host, function () {
    var host = server.address();
    console.log('Listening on %s:%s', host.address, host.port);
});


// socket
var WebSocketServer = require('./modules/socket-server');
var ws = new WebSocketServer({
    http: server,
    prefix: '/socket'
});


// lobby
var Lobby = require('./modules/lobby');
var lobby = new Lobby();

// gamepad players
var players = {};
var colors = {};
var gamepads = {};

// rtc controller
var waitingGamepads = {};

// socket connection
ws.on('connection', function(client) {
    // console.log('connected', client.id);

    client.send('init', {
        id: client.id
    });

    client.on('register.game', function(playerID) {
        console.log('register.game', playerID);
        players[playerID] = client;

        // We don't want to spam the gamepad with events from the lobby.
        lobby.join(client);
    });

    client.on('register.gamepad', function(playerID) {
        console.log('register.gamepad', playerID);
        if (!(playerID in players)) {
            return console.warn('[register.gamepad] Player %s not yet in players:',
                playerID, players);
        }
    });

    client.on('gamepad', function(data) {
        console.log('[gamepad] Sending gamepad message to client:', data);

        var playerID = data.player;
        var playerClient = players[playerID];

        if (!(playerID in players)) {
            return console.error('[gamepad] Player %s not yet in players:',
                playerID, players);
        }

        playerClient.send('gamepad', data);
    });

    client.on('gamepad.color', function(data) {
        console.log('[gamepad] Sending gamepad color to gamepad:', data);

        var playerID = data.player;
        var gamepadClient = gamepads[playerID];

        colors[playerID] = data.color;

        if (!gamepadClient) {
            return console.error('[gamepad] Player %s not yet in gamepads:',
                playerID);
        }

        gamepadClient.send('gamepad.color', data.color);
    });

    client.on('rtc.peer', function (data) {
        var player = data.player;
        var peerGamepad = waitingGamepads[player];

        console.log('\n\n\npeer request made for player', player);

        // initiator or not
        if (peerGamepad && peerGamepad !== client &&
            peerGamepad.socket.readyState === 1) {

            console.log('found a waiting peer');

            // send a wink
            client.send('rtc.peer', {initiator: true});
            peerGamepad.send('rtc.peer');

            // swap numbers ;)
            client.peer = peerGamepad;
            peerGamepad.peer = client;

            // wait no more
            waitingGamepads[player] = null;
        } else {
            // waiting for a friend
            waitingGamepads[player] = client;
            console.log('no peer found yet, waiting...');
        }
    });

    client.on('rtc.signal', function (data) {
        console.log('signal recieved');
        if (client.peer) {
            client.peer.send('rtc.signal', data);
        } else {
            console.warn('signal with no peer!');
        }
    });

    client.on('rtc.close', function (data) {
        var peer = client.peer;
        var player = data.player;
        if (peer) {
            peer.send('rtc.close');
            peer.peer = null;
            client.peer = null;
        }
        waitingGamepads[player] = client;
    });

});
