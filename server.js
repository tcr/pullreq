var express = require('express');
var http = require('http');
var irc = require('irc');
var cookie = require('cookie');
var connect = require('connect');

COOKIE_SECRET = 'fire on time, reliable, your metronome';

/**
 * IRC
 */

var irc = require('irc');

/**
 * Application.
 */

var app = express();
var server = http.createServer(app);


var MemoryStore = express.session.MemoryStore;
var sessionStore = new MemoryStore();
app.configure(function () {
  //app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.session({
    store: sessionStore,
    secret: COOKIE_SECRET,
    key: 'express.sid'
  }));
  app.use(express.static('public'));
});

app.get('/id', function (req, res) {
  res.end('<h2>Hello, your session id is ' + req.sessionID + '</h2>');
});

/**
 * Websockets.
 */

var io = require('socket.io').listen(server);
io.set('log level', 1)

io.set('authorization', function (data, accept) {
  if (!data.headers.cookie) {
    return accept('No cookie transmitted.', false);
  }

  var cookies = connect.utils.parseSignedCookies(cookie.parse(decodeURIComponent(data.headers.cookie)), COOKIE_SECRET);
  var sid = cookies['express.sid'];
  sessionStore.load(sid, function (err, session) {
    if (err || !session) {
      accept(err, false);
    } else {
      data.sessionID = sid;
      data.session = session;
      accept(null, true);
    }
  });
});

/**
 * IRC
 */

var ircClients = {};

function getIrcClient (socket) {
  var sid = socket.handshake.sessionID;
  if (Object.prototype.hasOwnProperty.call(ircClients, sid)) {
    return ircClients[sid];
  }
  return null;
}

function createIrcClient (socket, username) {
  var sid = socket.handshake.sessionID;
  var client = new irc.Client('irc.freenode.net', username);
  ircClients[sid] = client;
  return client;
}

function destroyIrcClient (socket) {
  var sid = socket.handshake.sessionID;
  var client = getIrcClient(socket);
  if (client) {
    // TODO something
  }
  delete ircClients[sid];
}

// Reap IRC clients.
setInterval(function () {
  for (var sid in ircClients) {
    if (ircClients[sid].reap < new Date()) {
      console.log('Reaped disconnected client', sid);
      delete ircClients[sid];
    }
  }
}, 1000)

io.sockets.on('connection', function (socket) {

  console.log('A socket with sessionID ' + socket.handshake.sessionID + ' connected!');
  // setup an inteval that will keep our session fresh
  var intervalID = setInterval(function () {
    // reload the session (just in case something changed,
    // we don't want to override anything, but the age)
    // reloading will also ensure we keep an up2date copy
    // of the session with our connection.
    socket.handshake.session.reload(function () { 
      // "touch" it (resetting maxAge and lastAccess)
      // and save it back again.
      socket.handshake.session.touch().save();
    });
  }, 60 * 1000);
  socket.on('disconnect', function () {
    console.log('A socket with sessionID ' + socket.handshake.sessionID + ' disconnected!');
    // clear the socket interval to stop refreshing the session
    clearInterval(intervalID);
  });

  // We only want a client with a session.
  if (!socket.handshake.session) {
    return;
  }

  console.log('New connection with valid session.');

  socket.on('initialize', function (opts) {
    console.log('Initializing client.');

    var client = getIrcClient(socket), reinit = false;
    if (client) {
      client.socket = socket;
    }

    if (!client) {
      // Create new client.
      console.log('Creating new IRC client.');
      client = createIrcClient(socket, opts.username);
      client.messages = [];
      client.socket = socket;

      // Forward methods to server.
      ['error', 'message', 'join', 'registered', 'names'].forEach(function (type) {
        client.on(type, function () {
          console.log('Sending command:', type);
          var message = {
            type: type,
            args: [].slice.call(arguments)
          }
          client.messages.push(message);
          client.socket.emit('command', message, function (acked) {
            console.log('Message acknowledged.');
            client.messages.shift();
          });
        });
      });
    } else if (opts.restore && client) {
      // Restore stored buffer.
      console.log('Restoring stored buffer.');
      console.log(client.messages);
      client.messages.forEach(function (message) {
        client.socket.emit('command', message, function (acked) {
          console.log('Stored acknowledged.');
          client.messages.shift();
        });
      });
    } else {
      console.log('Using existing client. Listing room.');
    }
    // Clean state.
    delete client.reap;

    socket.on('disconnect', function () {
      console.log('Client disconnected.');
      client.reap = new Date(Date.now() + 1000*60*5);
    });

    // Forward methods to client.
    ['send', 'join', 'part', 'say', 'whois', 'list'].forEach(function (type) {
      socket.on(type, function () {
        console.log('Received command:', type);
        client[type].apply(client, arguments);
      });
    });
  });
});

/**
 * Launch.
 */

console.log('Launch app at http://localhost:3000/');
server.listen(3000);