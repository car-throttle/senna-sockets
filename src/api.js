var _ = require('lodash');
var async = require('async');
var bodyParser = require('body-parser');
var config = require('./config');
var debug = require('debug')('SennaSockets:API');
var jwt = require('jsonwebtoken');
var model = require('./model');
var router = module.exports = require('express').Router();
var uuid = require('uuid');

var redis = require('redis').createClient({
  host: config.redis.host,
  port: config.redis.port,
  prefix: config.redis.prefix + ':'
});

var sockets = require('socket.io-emitter')({
  host: config.redis.host,
  port: config.redis.port,
  key: config.redis.prefix + ':'
});

/**
 * Middleware for processing those lovely JSON request bodies we will be receiving!
 */
router.use(bodyParser.json({ limit: '1mb' }));

/**
 * Middleware for authentication
 * - Decode the JWT token
 * - Return errors if the token is invalid
 * - The token itself must be signed with the same algorithm & secret that is stated in config.js, and all we want is
 *   a user_id property
 */
router.use(function authentication(req, res, next) {
  req.decoded_token = {};
  req.domain = Object.assign({}, config.domain);

  if (!req.get(config.jwt.header)) return next();

  jwt.verify(req.get(config.jwt.header), config.jwt.secret, {
    algorithms: [ config.jwt.algorithm ]
  }, function (err, decoded) {
    if (err) {
      /* istanbul ignore else */
      if (err.message === 'jwt malformed') err.user_message = 'Your token is invalid - please check it and try again';
      err.code = 'INVALID_TOKEN_ERR',
      err.status = 401;
      return next(err);
    }
    if (!decoded || !decoded.user_id) return next(model._formatError(new Error(), {
      code: 'INVALID_TOKEN_ERR',
      name: 'UnauthenticatedError',
      message: 'Missing token/user_id from token',
      status: 401,
      user_message: 'Incorrect token - please try a different one'
    }));

    req.decoded_token = decoded;
    next();
  });
});

/**
 * A simple route confirming that the service is active
 * And verifies whether authentication was successful
 */
router.get('/', function (req, res) {
  res.json({
    authenticated: !!req.decoded_token.user_id,
    message: 'Welcome to a realtime chat API',
    success: true
  });
});

/**
 * A route to get a list of "active" chats, sorted courtesy of a Redis Sorted Set
 * This route also uses our "model" to fetch public data from our API, so the client doesn't have to make
 *   additional requests to get the target data. Hooray!
 */
router.get('/list', function (req, res, next) {
  if (!req.decoded_token.user_id) return next(model._formatError(new Error(), model.UNAUTHENTICATED_ERR));

  var state = {
    key: req.domain.handle + ':inbox:' + req.decoded_token.user_id,
    page: parseInt(req.query.page, 10) || 1,
    per_page: parseInt(req.query.limit, 10) || 10,
    total: 0,
    total_pages: 1
  };

  debug('Fetching messages for ' + state.key);

  redis.zrevrange(config.messages.prefix + ':' + state.key, 0, -1, 'WITHSCORES', function (err, result) {
    /* istanbul ignore if */
    if (err) return next(err);
    if (!result || !result.length) return res.json({ state: state, entries: [] });

    var list = [];
    // This loop requires moving each 2, because ZREVRANGE returns tuples of results in a flat array
    for (var i = 0; i < result.length; i = i + 2) {
      var value = {
        type: null,
        id: null,
        latest: null,
        timestamp: null
      };

      value.type = result[i].split('-')[0];
      value.id = parseInt(result[i].split('-')[1], 10);
      value.timestamp = parseInt(result[i + 1], 10);

      /* istanbul ignore next */
      if (!value.type && !value.id) continue;

      list.push(value);
    }
    list = _.sortBy(list, 'timestamp').reverse();

    state.total = list.length;
    state.total_pages = Math.ceil(state.total / state.per_page);

    debug('Found ' + state.total + ' messages for ' + state.key);

    /* istanbul ignore if */
    if (list.length > state.per_page) {
      list = list.slice((state.page * state.per_page) - state.per_page, (state.page * state.per_page));
    }

    /* istanbul ignore if */
    if (req.query.hasOwnProperty('no_format')) return res.json({ state: state, entries: list });

    var fns = {};
    var latest = {};
    // var others = [];
    var topic_ids = [];
    var user_ids = [];

    list.forEach(function (item) {
      switch (item.type) {
        case 'topic':
          topic_ids.push(item.id);
          break;
        case 'user':
          user_ids.push(item.id);
          break;
        // default:
        //   others.push(item.type);
      }
    });

    if (topic_ids.length) fns.topics = function (parallelCb) {
      async.waterfall([
        function (waterfallCb) {
          model.getTopicsByIds(topic_ids, waterfallCb);
        },
        function (entries, waterfallCb) {
          fetchLatestMessageByEntries({
            entries: entries,
            latest: latest,
            messages_prefix: config.messages.prefix + ':' + req.domain.handle + ':topic:',
            latest_prefix: 'topic-',
          }, waterfallCb);
        }
      ], parallelCb);
    };

    if (user_ids.length) fns.users = function (parallelCb) {
      async.waterfall([
        function (waterfallCb) {
          model.getUsersById(user_ids, waterfallCb);
        },
        function (entries, waterfallCb) {
          fetchLatestMessageByEntries({
            entries: entries,
            latest: latest,
            messages_prefix: config.messages.prefix + ':' + req.domain.handle + ':dm:',
            latest_prefix: 'user-',
            user_id: req.decoded_token.user_id
          }, waterfallCb);
        }
      ], parallelCb);
    };

    // if (others.length) fns.others = function (parallelCb) {
    //   // Handle the other types, like bots?
    // };

    async.parallel(fns, function (err, data) {
      /* istanbul ignore if */
      if (err) return next(err);

      data = data || {};
      data.others = data.others || {};
      data.topics = data.topics || {};
      data.users = data.users || {};

      res.json({
        state: state,
        entries: list.map(function (item) {
          item.timestamp = model._formatTimestamp(item.timestamp);

          switch (item.type) {
            case 'topic':
              item.latest = latest['' + item.type + '-' + item.id] || null;
              item.topic = data.topics['' + item.id] || null;
              break;
            case 'user':
              item.latest = latest['' + item.type + '-' + item.id] || null;
              item.user = data.users['' + item.id] || null;
              break;
          }

          return item;
        })
      });
    });
  });
});

/**
 * A route to get the recent messages of a particular chat
 * Again, this route also uses our "model" to fetch public data from our API, so the client doesn't have to make
 *   additional requests to get the target data. Hooray!
 */
router.get('/:target/:target_id', function (req, res, next) {
  if (!req.decoded_token.user_id) return next(model._formatError(new Error(), model.UNAUTHENTICATED_ERR));

  var state = {
    key: null,
    page: parseInt(req.query.page, 10) || 1,
    per_page: parseInt(req.query.limit, 10) || 10,
    total: 0,
    total_pages: 1
  };

  switch (req.params.target) {
    case 'topic':
      state.key = req.domain.handle + ':topic:' + req.params.target_id;
      break;
    case 'user':
      state.key = req.domain.handle + ':dm:' + sortUserIds(req.decoded_token.user_id, req.params.target_id);
      break;
  }

  if (!state.key) return next(model._formatError(new Error(), {
    code: 'MESSAGES_INVALID_TARGET',
    name: 'ArgumentError',
    message: 'Invalid target "' + req.params.target + '"',
    status: 400
  }));

  var start = (state.page * state.per_page);
  var end = ((state.page * state.per_page) - state.per_page) + 1;

  var author_ids = [ req.params.target_id ];
  var result = {
    state: state,
    entry: null,
    messages: []
  };

  async.series([

    /**
     * Fetch the messages, and collect all the author IDs
     */
    function (seriesCb) {
      redis.lrange(config.messages.prefix + ':' + state.key, start * -1, end * -1, function (err, message_ids) {
        /* istanbul ignore if */
        if (err) return seriesCb(err);

        var callback = function (err, messages) {
          /* istanbul ignore if */
          if (err) return seriesCb(err);

          messages = messages
            .map(function (m) {
              try {
                m = model.formatMessage(JSON.parse(m));
                author_ids.push(m.author);
                return m;
              }
              catch (e) {
                /* istanbul ignore next */
                return null;
              }
            })
            .filter(function (m) {
              return !!m && m.id;
            });

          state.total = messages.length;
          state.total_pages = Math.ceil(state.total / state.per_page) || 1;
          result.messages = messages;

          seriesCb(null, messages);
        };
        redis.hmget.apply(redis, [ config.messages.prefix + ':' + state.key + ':data' ].concat(message_ids, callback));
      });
    },

    function (seriesCb) {
      var fns = [];

      switch (req.params.target) {
        case 'topic':
          fns.push(function (parallelCb) {
            model.getTopicsByIds([ req.params.target_id ], function (err, topics) {
              /* istanbul ignore if */
              if (err) return parallelCb(err);
              if (!Array.isArray(topics) || !topics.length) return parallelCb();

              result.entry = topics.shift();
              parallelCb();
            });
          });
          break;
      }

      fns.push(function (parallelCb) {
        model.getUsersById(_.uniq(author_ids), function (err, users) {
          /* istanbul ignore if */
          if (err) return parallelCb(err);

          var hash = {};
          users.forEach(function (user) {
            /* instanbul ignore else */
            if (user && user.id) hash['' + user.id] = user;
          });

          if (req.params.target === 'user') result.entry = hash['' + req.params.target_id];
          result.messages = result.messages.map(function (message) {
            message.author = hash['' + message.author];
            return message;
          });
          parallelCb();
        });
      });

      async.parallel(fns, seriesCb);
    }

  ], function (err) {
    /* istanbul ignore if */
    if (err) next(err);
    else res.json(result);
  });
});

/**
 * A route to create a new message, and add it to the relevant lists, hashmaps & sorted sets
 */
router.post('/:target/:target_id', function (req, res, next) {
  if (!req.decoded_token.user_id) return next(model._formatError(new Error(), model.UNAUTHENTICATED_ERR));

  var state = {
    key: null,
    inbox_key: null
  };

  switch (req.params.target) {
    case 'topic':
      state.key = req.domain.handle + ':topic:' + req.params.target_id;
      state.inbox_key = 'topic-' + req.params.target_id;
      break;
    case 'user':
      state.key = req.domain.handle + ':dm:' + sortUserIds(req.decoded_token.user_id, req.params.target_id);
      state.inbox_key = 'user-' + req.params.target_id;
      break;
  }

  if (!state.key) return next(model._formatError(new Error(), {
    code: 'MESSAGES_INVALID_TARGET',
    name: 'ArgumentError',
    message: 'Invalid target "' + req.params.target + '"',
    status: 400
  }));

  var message = {
    id: uuid.v4(),
    author: req.decoded_token.user_id,
    timestamp: (new Date()).toISOString(),
    type: req.body.type
  };

  switch (req.body.type) {

    case 'text':
      if (!req.body.text) return next(model._formatError(new Error(), {
        name: 'ArgumentError',
        message: 'Missing text property for text-message',
        status: 400
      }));
      message.text = req.body.text;
      break;

    case 'image':
      if (!req.body.image) return next(model._formatError(new Error(), {
        name: 'ArgumentError',
        message: 'Missing image property for image-message',
        status: 400
      }));
      message.image = req.body.image;
      break;

    default:
      return next(model._formatError(new Error(), {
        code: 'MESSAGES_INVALID_TYPE',
        name: 'ArgumentError',
        message: 'Invalid type "' + req.body.type + '"',
        status: 400
      }));

  }

  var multi = redis.multi();

  // Save the message
  multi.hset(config.messages.prefix + ':' + state.key + ':data', message.id, JSON.stringify(message));
  multi.rpush(config.messages.prefix + ':' + state.key, message.id);

  // Cheekily update the last-active of this user
  multi.hset(config.messages.prefix + ':' + req.domain.handle + ':activity:' + req.decoded_token.user_id,
    'last_active', new Date());

  // Cheekily insert a new chat for us
  multi.zadd(config.messages.prefix + ':' + req.domain.handle + ':inbox:' + req.decoded_token.user_id,
    Date.now(), state.inbox_key);
  // If this is with another human, insert the chat into their inbox too
  if (req.params.target === 'user') {
    multi.zadd(config.messages.prefix + ':' + req.domain.handle + ':inbox:' + req.params.target_id,
      Date.now(), 'user-' + req.decoded_token.user_id);
  }

  multi.exec(function (err) {
    /* istanbul ignore if */
    if (err) return next(err);

    message = model.formatMessage(message);

    res.status(201).json({
      state: state,
      entry: message
    });

    // Emit create event to socket here
    switch (req.params.target) {

      case 'topic':
        sockets.to('topic-' + req.params.target_id).emit('new-message', message);
        break;

      case 'user':
        sockets.to('user-' + req.params.target_id).emit('new-message', message);
        sockets.to('user-' + req.decoded_token.user_id).emit('new-message', message);
        break;

    }
  });
});

/**
 * A route to update a new message (or at least, parts of it)
 */
router.post('/:target/:target_id/:message_id', function (req, res, next) {
  if (!req.decoded_token.user_id) return next(model._formatError(new Error(), model.UNAUTHENTICATED_ERR));

  var state = {
    key: null,
    inbox_key: null
  };

  switch (req.params.target) {
    case 'topic':
      state.key = req.domain.handle + ':topic:' + req.params.target_id;
      state.inbox_key = 'topic-' + req.params.target_id;
      break;
    case 'user':
      state.key = req.domain.handle + ':dm:' + sortUserIds(req.decoded_token.user_id, req.params.target_id);
      state.inbox_key = 'user-' + req.params.target_id;
      break;
  }

  if (!state.key) return next(model._formatError(new Error(), {
    code: 'MESSAGES_INVALID_TARGET',
    name: 'ArgumentError',
    message: 'Invalid target "' + req.params.target + '"',
    status: 400
  }));

  redis.hget(config.messages.prefix + ':' + state.key + ':data', req.params.message_id, function (err, message) {
    /* istanbul ignore if */
    if (err) return next(err);
    if (message) {
      try { message = JSON.parse(message); }
      catch (e) { /* istanbul ignore next */ message = null; }
    }
    if (!message || !message.id) return next(model._formatError(new Error(), {
      code: 'NOT_FOUND',
      name: 'NotFound',
      message: 'Message not found',
      status: 404
    }));

    var difference = {};

    /* istanbul ignore else */
    if (req.body.status) switch (req.body.status) {
      case 'seen':
        message.status = difference.status = req.body.status;
        break;
    }

    switch (message.type) {

      case 'text':
        if (req.body.text) message.text = difference.text = req.body.text;
        break;

      case 'image':
        if (req.body.image) message.image = difference.image = req.body.image;
        break;

    }

    if (Object.keys(difference).length === 0) return next(model._formatError(new Error(), {
      name: 'ArgumentError',
      message: 'No valid data was supplied',
      status: 400
    }));

    redis.hset(
      config.messages.prefix + ':' + state.key + ':data', req.params.message_id, JSON.stringify(message),
      function (err) {
        /* istanbul ignore if */
        if (err) return next(err);

        res.json({
          state: state,
          entry: model.formatMessage(message)
        });

        // Emit update event to socket here
      }
    );
  });
});

/**
 * A route to clear a chat
 */
// router.delete('/:target/:target_id', function (req, res, next) {
//   if (!req.decoded_token.user_id) return next(model._formatError(new Error(), model.UNAUTHENTICATED_ERR));
//
//   var state = {
//     key: null,
//     inbox_key: null
//   };
//
//   switch (req.params.target) {
//     case 'topic':
//       state.key = req.domain.handle + ':topic:' + req.params.target_id;
//       state.inbox_key = 'topic-' + req.params.target_id;
//       break;
//     case 'user':
//       state.key = req.domain.handle + ':dm:' + sortUserIds(req.decoded_token.user_id, req.params.target_id);
//       state.inbox_key = 'user-' + req.params.target_id;
//       break;
//   }
//
//   if (!state.key) return next(model._formatError(new Error(), {
//     code: 'MESSAGES_INVALID_TARGET',
//     name: 'ArgumentError',
//     message: 'Invalid target "' + req.params.target + '"',
//     status: 400
//   }));
//
//   var multi = redis.multi();
//
//   multi.del(config.messages.prefix + ':' + state.key);
//   multi.del(config.messages.prefix + ':' + state.key + ':data');
//
//   multi.exec(function (err) {
//     /* istanbul ignore if */
//     if (err) return next(err);
//
//     res.json({
//       state: state,
//       message: 'Successfully cleared all the messages',
//       success: true
//     });
//
//     // Emit clear event to socket
//   });
// });

/**
 * A route to delete an individual message
 */
router.delete('/:target/:target_id/:message_id', function (req, res, next) {
  if (!req.decoded_token.user_id) return next(model._formatError(new Error(), model.UNAUTHENTICATED_ERR));

  var state = {
    key: null,
    inbox_key: null
  };

  switch (req.params.target) {
    case 'topic':
      state.key = req.domain.handle + ':topic:' + req.params.target_id;
      state.inbox_key = 'topic-' + req.params.target_id;
      break;
    case 'user':
      state.key = req.domain.handle + ':dm:' + sortUserIds(req.decoded_token.user_id, req.params.target_id);
      state.inbox_key = 'user-' + req.params.target_id;
      break;
  }

  if (!state.key) return next(model._formatError(new Error(), {
    code: 'MESSAGES_INVALID_TARGET',
    name: 'ArgumentError',
    message: 'Invalid target "' + req.params.target + '"',
    status: 400
  }));

  redis.hexists(config.messages.prefix + ':' + state.key + ':data', req.params.message_id, function (err, exists) {
    /* istanbul ignore if */
    if (err) return next(err);
    if (!exists) return next(model._formatError(new Error(), {
      code: 'NOT_FOUND',
      name: 'NotFound',
      message: 'Message not found',
      status: 404
    }));

    var multi = redis.multi();

    multi.hdel(config.messages.prefix + ':' + state.key + ':data', req.params.message_id);
    multi.lrem(config.messages.prefix + ':' + state.key, -1, req.params.message_id);

    multi.exec(function (err) {
      /* istanbul ignore if */
      if (err) return next(err);

      res.json({
        state: state,
        message: 'Message deleted',
        success: true
      });

      // Emit delete event to socket
    });
  });
});

/**
 * Handle any additional routes that people may try
 */
router.use(function (req, res, next) {
  next(model._formatError(new Error(), {
    code: 'NOT_FOUND',
    name: 'RouteNotFoundError',
    message: 'Route at ' + req.originalUrl + ' was not found',
    status: 404,
    user_message: 'Route not found - please check your URL and try again'
  }));
});

/**
 * Handle any errors that this API comes up with
 */
router.use(function (err, req, res, next) {
  /* jshint unused: false */
  var output = {
    error: true,
    code: err.code || null,
    name: err.name || 'Error',
    message: err.user_message || err.message || 'Something went wrong',
    status: err.status || 500,
    stack: err.stack || []
  };

  /* istanbul ignore if */
  if (!process.env.IS_TESTING) console.error(err, err.stack); // jshint ignore:line
  res.status(output.status).json(_.omit(output, [ config.isProduction ? 'stack' : null ]));
});

var fetchLatestMessageByEntries = function (opts, callback) {
  /* istanbul ignore if */
  if (!opts || !Array.isArray(opts.entries) || !opts.entries.length || !opts.latest) return callback();
  /* istanbul ignore if */
  if (!opts.messages_prefix) return callback(new Error('Missing messages_prefix'));
  /* istanbul ignore if */
  if (!opts.latest_prefix) return callback(new Error('Missing latest_prefix'));

  /* istanbul ignore next */
  if (opts.latest_prefix === 'user-') {
    if (!opts.user_id) return callback(new Error('Missing current user_id'));
  }

  var hash = {};
  var multi = redis.multi();

  opts.entries.forEach(function (entry) {
    /* istanbul ignore if */
    if (!entry || !entry.id) return;

    hash['' + entry.id] = entry;
    if (opts.latest_prefix === 'user-') {
      multi.lrange(opts.messages_prefix + sortUserIds(opts.user_id, entry.id), -1, 1);
    }
    else {
      multi.lrange(opts.messages_prefix + entry.id, -1, 1);
    }
  });

  multi.exec(function (err, results) {
    /* istanbul ignore if */
    if (err) return callback(err);

    var commands = [];
    results.forEach(function (messages, i) {
      if (!Array.isArray(messages) || !messages.length) return;

      if (opts.latest_prefix === 'user-') {
        commands.push([
          'HGET', opts.messages_prefix + sortUserIds(opts.user_id, opts.entries[i].id) + ':data', messages.shift()
        ]);
      }
      else {
        commands.push([
          'HGET', opts.messages_prefix + opts.entries[i].id + ':data', messages.shift()
        ]);
      }
    });

    if (!commands.length) return callback(null, hash);

    redis.multi(commands).exec(function (err, results) {
      /* istanbul ignore if */
      if (err) return callback(err);

      results.forEach(function (message, i) {
        try {
          /* istanbul ignore else */
          if (('' + message).indexOf('{') === 0) {
            opts.latest[opts.latest_prefix + opts.entries[i].id] = model.formatMessage(JSON.parse(message));
          }
        }
        catch (e) {}
      });

      callback(null, hash);
    });
  });
};

var sortUserIds = function (user_one_id, user_two_id) {
  return user_one_id > user_two_id ? user_two_id + '-' + user_one_id : user_one_id + '-' + user_two_id;
};
