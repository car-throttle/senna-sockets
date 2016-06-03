var _ = require('lodash');
var config = require('./config');
var debug = require('debug')('SennaSockets:Server');
var express = require('express');
var http = require('http');
var jwt = require('jsonwebtoken');
var model = require('./model');
var redis = require('redis');

var app = express();
app.use('/api', require('./api'));
app.get('/', function (req, res) {
  res.json(config.introductions[Math.floor(Math.random() * config.introductions.length)]);
});

var server = http.createServer(app);

server.on('error', function onError(err) {
  if (err.syscall === 'listen') switch (err.code) {
    case 'EACCES':
      console.error('Port ' + config.http.port + ' requires elevated privileges'); // jshint ignore:line
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error('Port ' + config.http.port + ' is already in use'); // jshint ignore:line
      process.exit(1);
      break;
  }

  throw err;
});

server.on('listening', function onListening() {
  console.log('Sockets listening on %s:%s', config.http.host, config.http.port); // jshint ignore:line
});

var io = require('socket.io')(server);
io.adapter(require('socket.io-redis')({
  host: config.redis.host,
  key: config.redis.prefix,
  port: config.redis.port
}));

var redisClient = redis.createClient({
  host: config.redis.host,
  port: config.redis.port
});

io.sockets.on('connection', require('socketio-jwt').authorize({
  timeout: 15000, // 15 seconds to send the authentication message

  algorithm: 'HS256',
  secret: config.jwt.secret,

  additional_auth: function (decoded_token, resolveFn, rejectFn) {
    // Rebuild the token, since socketio-jwt doesn't give it back to us
    var token = jwt.sign(_.omit(decoded_token, [ 'iat' ]), config.jwt.secret, {
      algorithm: config.jwt.algorithm,
      noTimestamp: true
    });

    model.authenticate(token, function (err, session) {
      if (err || !session) return rejectFn(err.message || 'Failed to connect to the API', 'api_error');
      if (!session.user || !session.user.id) return rejectFn('Invalid user returned from the session', 'api_error');
      if (!session.user.role || !session.user.role.handle) return rejectFn('Missing user role', 'api_error');

      if (session.user.role.handle === 'deleted') return rejectFn('Deleted users cannot use this', 'user_error');
      if (session.user.role.handle === 'banned') return rejectFn('Banned users cannot use this', 'user_error');

      decoded_token.user = session.user;
      resolveFn();
    });
  }
}));

io.sockets.on('authenticated', function (socket) {
  // debug('authenticated', socket.decoded_token.token);
  debug('authenticated', _.pick(socket.decoded_token.user, [
    'id', 'username', 'score', 'profile_url', 'notification_count'
  ]));

  // A room for all the sockets used by a particular user
  socket.join('user-' + socket.decoded_token.user.id);

  var multi = redisClient.multi();
  multi.hset('messages:carthrottle:activity:' + socket.decoded_token.user.id, 'status', 'active');
  multi.exec(function (err) {
    if (err) {
      // Log the error or something?
      console.error(err.stack || err); // jshint ignore:line
    }
  });

  socket.on('disconnect', function () {
    io.in('user-' + socket.decoded_token.user.id).clients(function (err, clients) {
      if (err) {
        // Log the error or something?
        console.error(err.stack || err); // jshint ignore:line
      }
      else if (Array.isArray(clients) && clients.length) {
        // Assuming there are still clients
        return;
      }

      var multi = redisClient.multi();
      multi.hset('messages:carthrottle:activity:' + socket.decoded_token.user.id, 'status', 'inactive');
      multi.exec(function (err) {
        if (err) {
          // Log the error or something?
          console.error(err.stack || err); // jshint ignore:line
        }
      });
    });
  });
});

var redisSubscriber = redis.createClient({
  host: config.redis.host,
  port: config.redis.port
});

redisSubscriber.subscribe('messages:events');
redisSubscriber.on('messages:events', function (message) {
  try { message = JSON.parse(message); }
  catch (e) { return; }

  switch (message.type) {

    // If these two conditions & statements work at all, then socket.io might just be my new best friend!

    case 'join-room':
      io.to('user-' + message.user_id).join(message.room);
      break;

    case 'leave-room':
      io.to('user-' + message.user_id).leave(message.room);
      break;

    default:
      // Log that we don't know what to do with this event
      if (!message.type) return;

  }
});

if (!module.parent) server.listen(config.http.port, config.http.host);
