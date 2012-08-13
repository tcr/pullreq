var express = require('express');
var http = require('http');
var irc = require('irc');

/**
 * IRC
 */

var irc = require('irc');

/**
 * Application.
 */

var app = express();
var server = http.createServer(app);

app.use(express.static('public'));

/**
 * Websockets.
 */

var io = require('socket.io').listen(server);
io.set('log level', 1)

io.sockets.on('connection', function (socket) {
  console.log('New connection. Contacting IRC.');

  var client = new irc.Client('irc.freenode.net', 'parallel-avatar');

  client.on('registered', function (message) {
    console.log('REGISTERED', message);
    client.join('#gameclosure');
  });

  ['send', 'join', 'part', 'say', 'whois', 'list'].forEach(function (type) {
    socket.on(type, function () {
      console.log('Received', type, 'command.');
      client[type].apply(client, arguments);
    });
  });

  ['error', 'message', 'join', 'registered', 'names'].forEach(function (type) {
    client.on(type, function () {
      console.log('Emitting', type, 'command.');
      socket.emit.apply(socket, [type].concat([].slice.call(arguments)));
    })
  });
});

/**
 * Launch.
 */

console.log('Launch app at http://localhost:3000/');
server.listen(3000);