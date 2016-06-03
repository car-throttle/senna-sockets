var async = require('async');
var cleanup = require('./cleanup.lib');
var config = require('../src/config');
var fn = require('./functions');
var mock = require('./nock.lib');
var request = require('./request.lib');

describe('API', function () {

  it('should return a 200 OK even though we are not authenticated', function (done) {
    request()
      .get('/')
      .set(request.headers)
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        authenticated: false,
        message: 'Welcome to a realtime chat API',
        success: true
      })
      .end(done);
  });

  it('should return 401 if an invalid token is used', function (done) {
    request()
      .get('/')
      .set(request.headers)
      .set(config.jwt.header, 'lol')
      .expect(401)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'INVALID_TOKEN_ERR',
        name: 'JsonWebTokenError',
        message: 'Your token is invalid - please check it and try again',
        stack: [],
        status: 401
      })
      .end(done);
  });

  it('should return 401 if an incorrect token is used', function (done) {
    request()
      .get('/')
      .set(request.headers)
      .set(config.jwt.header, fn.generateToken({ cat: 'meow' }))
      .expect(401)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'INVALID_TOKEN_ERR',
        name: 'UnauthenticatedError',
        message: 'Incorrect token - please try a different one',
        stack: [],
        status: 401
      })
      .end(done);
  });

  it('should return a 200 OK if we are authenticated', function (done) {
    request()
      .get('/')
      .set(request.headers)
      .set(config.jwt.header, fn.generateToken({ user_id: 388636 }))
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        authenticated: true,
        message: 'Welcome to a realtime chat API',
        success: true
      })
      .end(done);
  });

  it('should return an error if the user is not authenticated correctly', function (done) {
    request()
      .get('/list')
      .set(request.headers)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'NOT_AUTHENTICATED',
        name: 'UnauthenticatedError',
        message: 'You are not authenticated',
        stack: [],
        status: 401
      })
      .end(done);
  });

  it('should return an empty list of chats', function (done) {
    async.series([

      cleanup.redis([
        [ 'DEL', 'messages:myplatform:inbox:388636' ]
      ]),

      function (callback) {
        request()
          .get('/list')
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .expect(200)
          .expect('Content-Type', /json/)
          .expect({
            state: {
              key: 'myplatform:inbox:388636',
              page: 1,
              per_page: 10,
              total: 0,
              total_pages: 1
            },
            entries: []
          })
          .end(callback);
      },

    ], done);
  });

  it('should return a list of chats with no recent messages', function (done) {
    async.series([

      cleanup.redis([
        [ 'DEL', 'messages:myplatform:inbox:388636' ],
        [ 'ZADD', 'messages:myplatform:inbox:388636',
          1464896060713, 'user-342676', 1464857720713, 'user-524376' ],
        [ 'DEL', 'messages:myplatform:dm:342676-388636', 'messages:myplatform:dm:388636-524376',
          'messages:myplatform:dm:342676-388636:data', 'messages:myplatform:dm:388636-524376:data' ]
      ]),

      function (callback) {
        mock.usersByIds([ 342676, 524376 ]);

        request()
          .get('/list')
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .expect(200)
          .expect('Content-Type', /json/)
          .expect({
            state: {
              key: 'myplatform:inbox:388636',
              page: 1,
              per_page: 10,
              total: 2,
              total_pages: 1
            },
            entries: [
              {
                type: 'user',
                id: 342676,
                latest: null,
                timestamp: {
                  epoch: 1464896060713,
                  iso: '2016-06-02T19:34:20.713Z'
                },
                user: {
                  id: 342676,
                  username: 'Barry from Earth-342676',
                  role: {
                    id: 3,
                    handle: 'registered',
                    value: 'Registered'
                  }
                }
              },
              {
                type: 'user',
                id: 524376,
                latest: null,
                timestamp: {
                  epoch: 1464857720713,
                  iso: '2016-06-02T08:55:20.713Z'
                },
                user: {
                  id: 524376,
                  username: 'Barry from Earth-524376',
                  role: {
                    id: 3,
                    handle: 'registered',
                    value: 'Registered'
                  }
                }
              }
            ]
          })
          .end(callback);
      },

    ], done);
  });

  it('should return a list of chats with recent messages', function (done) {
    async.series([

      cleanup.redis([
        [ 'DEL', 'messages:myplatform:inbox:388636' ],
        [ 'ZADD', 'messages:myplatform:inbox:388636',
          1464896060713, 'user-342676', 1464857720713, 'user-524376' ],
        [ 'DEL', 'messages:myplatform:dm:342676-388636', 'messages:myplatform:dm:388636-524376',
          'messages:myplatform:dm:342676-388636:data', 'messages:myplatform:dm:388636-524376:data' ],
        [ 'RPUSH', 'messages:myplatform:dm:342676-388636', '215066e1-e4a6-4a67-93b3-372519f7dfff' ],
        [ "HSET", 'messages:myplatform:dm:342676-388636:data', '215066e1-e4a6-4a67-93b3-372519f7dfff',
          JSON.stringify({
            id: '215066e1-e4a6-4a67-93b3-372519f7dfff',
            author: 388636,
            timestamp: '2016-06-02T21:39:36.342Z',
            type:'text',
            text: 'Hello, world!'
          }) ],
        [ 'RPUSH', 'messages:myplatform:dm:388636-524376', '215066e1-e4a6-4a67-93b3-372519f7dfff' ],
        [ 'HSET', 'messages:myplatform:dm:388636-524376:data', '215066e1-e4a6-4a67-93b3-372519f7dfff',
          JSON.stringify({
            id: '215066e1-e4a6-4a67-93b3-372519f7dfff',
            author: 524376,
            timestamp: '2016-06-02T21:39:36.342Z',
            type:'text',
            text: 'Hello, world!'
          }) ]
      ]),

      function (callback) {
        mock.usersByIds([ 342676, 524376 ]);

        request()
          .get('/list')
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .expect(200)
          .expect('Content-Type', /json/)
          .expect({
            state: {
              key: 'myplatform:inbox:388636',
              page: 1,
              per_page: 10,
              total: 2,
              total_pages: 1
            },
            entries: [
              {
                type: 'user',
                id: 342676,
                latest: {
                  id: '215066e1-e4a6-4a67-93b3-372519f7dfff',
                  author: 388636,
                  timestamp: {
                    epoch: 1464903576342,
                    iso: '2016-06-02T21:39:36.342Z'
                  },
                  type: 'text',
                  text: 'Hello, world!'
                },
                timestamp: {
                  epoch: 1464896060713,
                  iso: '2016-06-02T19:34:20.713Z'
                },
                user: {
                  id: 342676,
                  username: 'Barry from Earth-342676',
                  role: {
                    id: 3,
                    handle: 'registered',
                    value: 'Registered'
                  }
                }
              },
              {
                type: 'user',
                id: 524376,
                latest: {
                  id: '215066e1-e4a6-4a67-93b3-372519f7dfff',
                  author: 524376,
                  timestamp: {
                    epoch: 1464903576342,
                    iso: '2016-06-02T21:39:36.342Z'
                  },
                  type: 'text',
                  text: 'Hello, world!'
                },
                timestamp: {
                  epoch: 1464857720713,
                  iso: '2016-06-02T08:55:20.713Z'
                },
                user: {
                  id: 524376,
                  username: 'Barry from Earth-524376',
                  role: {
                    id: 3,
                    handle: 'registered',
                    value: 'Registered'
                  }
                }
              }
            ]
          })
          .end(callback);
      },

    ], done);
  });

  it('should return an error if the user is not authenticated correctly', function (done) {
    request()
      .get('/user/524376')
      .set(request.headers)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'NOT_AUTHENTICATED',
        name: 'UnauthenticatedError',
        message: 'You are not authenticated',
        stack: [],
        status: 401
      })
      .end(done);
  });

  it('should return an error if the specific chat is invalid', function (done) {
    request()
      .get('/villain/skynet')
      .set(request.headers)
      .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
      .expect(400)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'MESSAGES_INVALID_TARGET',
        name: 'ArgumentError',
        message: 'Invalid target "villain"',
        stack: [],
        status: 400
      })
      .end(done);
  });

  it('should successfully return a specific chat', function (done) {
    async.series([

      cleanup.redis([
        [ 'DEL', 'messages:myplatform:inbox:388636' ],
        [ 'DEL', 'messages:myplatform:dm:388636-524376', 'messages:myplatform:dm:388636-524376:data' ],
        [ 'RPUSH', 'messages:myplatform:dm:388636-524376', '215066e1-e4a6-4a67-93b3-372519f7dfff',
          '67d7fb6b-26b1-4972-a34d-67c0533e7e17' ],
        [ 'HSET', 'messages:myplatform:dm:388636-524376:data', '215066e1-e4a6-4a67-93b3-372519f7dfff',
          JSON.stringify({
            id: '215066e1-e4a6-4a67-93b3-372519f7dfff',
            author: 388636,
            timestamp: '2016-06-02T21:38:36.342Z',
            type:'text',
            text: 'Whaddup Barry!'
          }) ],
        [ 'HSET', 'messages:myplatform:dm:388636-524376:data', '67d7fb6b-26b1-4972-a34d-67c0533e7e17',
          JSON.stringify({
            id: '67d7fb6b-26b1-4972-a34d-67c0533e7e17',
            author: 524376,
            timestamp: '2016-06-02T21:39:36.342Z',
            type:'text',
            text: 'Hey, Barry!!'
          }) ]
      ]),

      function (callback) {
        mock.usersByIds([ 388636, 524376 ]);

        request()
          .get('/user/524376')
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .expect(200)
          .expect('Content-Type', /json/)
          .expect({
            state: {
              key: 'myplatform:dm:388636-524376',
              page: 1,
              per_page: 10,
              total: 2,
              total_pages: 1
            },
            entry: {
              id: 524376,
              username: 'Barry from Earth-524376',
              role: {
                id: 3,
                handle: 'registered',
                value: 'Registered'
              }
            },
            messages: [
              {
                id: '215066e1-e4a6-4a67-93b3-372519f7dfff',
                author: {
                  id: 388636,
                  username: 'Barry from Earth-388636',
                  role: {
                    id: 3,
                    handle: 'registered',
                    value: 'Registered'
                  }
                },
                timestamp: {
                  epoch: 1464903516342,
                  iso: '2016-06-02T21:38:36.342Z'
                },
                type:'text',
                text: 'Whaddup Barry!'
              },
              {
                id: '67d7fb6b-26b1-4972-a34d-67c0533e7e17',
                author: {
                  id: 524376,
                  username: 'Barry from Earth-524376',
                  role: {
                    id: 3,
                    handle: 'registered',
                    value: 'Registered'
                  }
                },
                timestamp: {
                  epoch: 1464903576342,
                  iso: '2016-06-02T21:39:36.342Z'
                },
                type:'text',
                text: 'Hey, Barry!!'
              }
            ]
          })
          .end(callback);
      },

    ], done);
  });

  it('should return an error if the user is not authenticated correctly', function (done) {
    request()
      .post('/user/524376')
      .set(request.headers)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'NOT_AUTHENTICATED',
        name: 'UnauthenticatedError',
        message: 'You are not authenticated',
        stack: [],
        status: 401
      })
      .end(done);
  });

  it('should return an error if the specific chat is invalid', function (done) {
    request()
      .post('/villain/skynet')
      .set(request.headers)
      .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
      .expect(400)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'MESSAGES_INVALID_TARGET',
        name: 'ArgumentError',
        message: 'Invalid target "villain"',
        stack: [],
        status: 400
      })
      .end(done);
  });

  it('should successfully send a message', function (done) {
    var MESSAGE_ID = null;
    var MESSAGE_JSON = null;

    async.series([

      cleanup.redis([
        [ 'DEL', 'messages:myplatform:inbox:388636' ],
        [ 'DEL', 'messages:myplatform:dm:388636-524376', 'messages:myplatform:dm:388636-524376:data' ]
      ]),

      function (callback) {
        mock.usersByIds([ 388636, 524376 ]);

        request()
          .post('/user/524376')
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .send({
            type: 'text',
            text: 'Well hello there Barry!'
          })
          .expect(201)
          .expect('Content-Type', /json/)
          .expect(function (res) {
            if (res.body && res.body.entry && res.body.entry.id) {
              MESSAGE_ID = res.body.entry.id;
              res.body.entry.id = 'MESSAGE_ID';

              MESSAGE_JSON = JSON.stringify({
                id: MESSAGE_ID,
                author: 388636,
                timestamp: (new Date(res.body.entry.timestamp.iso)).toISOString(),
                type: 'text',
                text: 'Well hello there Barry!'
              });

              res.body.entry.timestamp.epoch = 1464947344965;
              res.body.entry.timestamp.iso = '2016-06-03T09:49:04.965Z';
            }
          })
          .expect({
            state: {
              key: 'myplatform:dm:388636-524376',
              inbox_key: 'user-524376'
            },
            entry: {
              id: 'MESSAGE_ID',
              author: 388636,
              timestamp: {
                epoch: 1464947344965,
                iso: '2016-06-03T09:49:04.965Z'
              },
              type: 'text',
              text: 'Well hello there Barry!'
            }
          })
          .end(callback);
      },

      function (seriesCb) {
        var fn = cleanup.assertRedis([
          [ 'LRANGE', 'messages:myplatform:dm:388636-524376', '-1', '-1' ],
          [ 'HGET', 'messages:myplatform:dm:388636-524376:data', MESSAGE_ID ]
        ], [
          [ MESSAGE_ID ],
          MESSAGE_JSON
        ]);

        fn(seriesCb);
      }

    ], done);
  });

  it('should return an error if the message has an unsupported type', function (done) {
    request()
      .post('/user/524376')
      .set(request.headers)
      .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
      .send({
        type: 'link',
        link: 'https://www.carthrottle.com/user/jdrydn'
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'MESSAGES_INVALID_TYPE',
        name: 'ArgumentError',
        message: 'Invalid type "link"',
        stack: [],
        status: 400
      })
      .end(done);
  });

  it('should return an error if the user is not authenticated correctly', function (done) {
    request()
      .post('/user/524376/magical-not-found-message-id')
      .set(request.headers)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'NOT_AUTHENTICATED',
        name: 'UnauthenticatedError',
        message: 'You are not authenticated',
        stack: [],
        status: 401
      })
      .end(done);
  });

  it('should successfully update a message', function (done) {
    var MESSAGE_ID = null;
    var MESSAGE_JSON = null;

    async.series([

      cleanup.redis([
        [ 'DEL', 'messages:myplatform:inbox:388636' ],
        [ 'DEL', 'messages:myplatform:dm:388636-524376', 'messages:myplatform:dm:388636-524376:data' ]
      ]),

      function (callback) {
        mock.usersByIds([ 388636, 524376 ]);

        request()
          .post('/user/524376')
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .send({
            type: 'text',
            text: 'Well hello ther Barry!'
          })
          .expect(201)
          .expect('Content-Type', /json/)
          .expect(function (res) {
            if (res.body && res.body.entry && res.body.entry.id) {
              MESSAGE_ID = res.body.entry.id;
              res.body.entry.id = 'MESSAGE_ID';

              MESSAGE_JSON = JSON.stringify({
                id: MESSAGE_ID,
                author: 388636,
                timestamp: (new Date(res.body.entry.timestamp.iso)).toISOString(),
                type: 'text',
                text: 'Well hello ther Barry!'
              });

              res.body.entry.timestamp.epoch = 1464947344965;
              res.body.entry.timestamp.iso = '2016-06-03T09:49:04.965Z';
            }
          })
          .expect({
            state: {
              key: 'myplatform:dm:388636-524376',
              inbox_key: 'user-524376'
            },
            entry: {
              id: 'MESSAGE_ID',
              author: 388636,
              timestamp: {
                epoch: 1464947344965,
                iso: '2016-06-03T09:49:04.965Z'
              },
              type: 'text',
              text: 'Well hello ther Barry!'
            }
          })
          .end(callback);
      },

      function (seriesCb) {
        var fn = cleanup.assertRedis([
          [ 'LRANGE', 'messages:myplatform:dm:388636-524376', '-1', '-1' ],
          [ 'HGET', 'messages:myplatform:dm:388636-524376:data', MESSAGE_ID ]
        ], [
          [ MESSAGE_ID ],
          MESSAGE_JSON
        ]);

        fn(seriesCb);
      },

      function (callback) {
        mock.usersByIds([ 388636, 524376 ]);

        request()
          .post('/user/524376/' + MESSAGE_ID)
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .send({
            status: 'seen',
            text: 'Well hello there Barry!'
          })
          .expect(200)
          .expect('Content-Type', /json/)
          .expect(function (res) {
            if (res.body && res.body.entry && res.body.entry.id) {
              MESSAGE_ID = res.body.entry.id;
              res.body.entry.id = 'MESSAGE_ID';

              MESSAGE_JSON = JSON.stringify({
                id: MESSAGE_ID,
                author: 388636,
                timestamp: (new Date(res.body.entry.timestamp.iso)).toISOString(),
                type: 'text',
                text: 'Well hello there Barry!',
                status: 'seen'
              });

              res.body.entry.timestamp.epoch = 1464947344965;
              res.body.entry.timestamp.iso = '2016-06-03T09:49:04.965Z';
            }
          })
          .expect({
            state: {
              key: 'myplatform:dm:388636-524376',
              inbox_key: 'user-524376'
            },
            entry: {
              id: 'MESSAGE_ID',
              author: 388636,
              timestamp: {
                epoch: 1464947344965,
                iso: '2016-06-03T09:49:04.965Z'
              },
              type: 'text',
              text: 'Well hello there Barry!',
              status: 'seen'
            }
          })
          .end(callback);
      },

      function (seriesCb) {
        var fn = cleanup.assertRedis([
          [ 'LRANGE', 'messages:myplatform:dm:388636-524376', '-1', '-1' ],
          [ 'HGET', 'messages:myplatform:dm:388636-524376:data', MESSAGE_ID ]
        ], [
          [ MESSAGE_ID ],
          MESSAGE_JSON
        ]);

        fn(seriesCb);
      }

    ], done);
  });

  it('should return an error if the message doesn\'t exist', function (done) {
    request()
      .post('/user/524376/some-incorrect-message-id')
      .set(request.headers)
      .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
      .send({
        text: 'Well hello there Barry!'
      })
      .expect(404)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'NOT_FOUND',
        name: 'NotFound',
        message: 'Message not found',
        stack: [],
        status: 404
      })
      .end(done);
  });

  it('should return an error if the message to update has an unsupported type', function (done) {
    request()
      .post('/villain/skynet/some-incorrect-message-id')
      .set(request.headers)
      .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
      .send({
        text: 'Well hello there Barry!'
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'MESSAGES_INVALID_TARGET',
        name: 'ArgumentError',
        message: 'Invalid target "villain"',
        stack: [],
        status: 400
      })
      .end(done);
  });

  it('should return an error when updating a message with no data', function (done) {
    var MESSAGE_ID = null;
    var MESSAGE_JSON = null;

    async.series([

      cleanup.redis([
        [ 'DEL', 'messages:myplatform:inbox:388636' ],
        [ 'DEL', 'messages:myplatform:dm:388636-524376', 'messages:myplatform:dm:388636-524376:data' ]
      ]),

      function (callback) {
        mock.usersByIds([ 388636, 524376 ]);

        request()
          .post('/user/524376')
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .send({
            type: 'text',
            text: 'Well hello ther Barry!'
          })
          .expect(201)
          .expect('Content-Type', /json/)
          .expect(function (res) {
            if (res.body && res.body.entry && res.body.entry.id) {
              MESSAGE_ID = res.body.entry.id;
              res.body.entry.id = 'MESSAGE_ID';

              MESSAGE_JSON = JSON.stringify({
                id: MESSAGE_ID,
                author: 388636,
                timestamp: (new Date(res.body.entry.timestamp.iso)).toISOString(),
                type: 'text',
                text: 'Well hello ther Barry!'
              });

              res.body.entry.timestamp.epoch = 1464947344965;
              res.body.entry.timestamp.iso = '2016-06-03T09:49:04.965Z';
            }
          })
          .expect({
            state: {
              key: 'myplatform:dm:388636-524376',
              inbox_key: 'user-524376'
            },
            entry: {
              id: 'MESSAGE_ID',
              author: 388636,
              timestamp: {
                epoch: 1464947344965,
                iso: '2016-06-03T09:49:04.965Z'
              },
              type: 'text',
              text: 'Well hello ther Barry!'
            }
          })
          .end(callback);
      },

      function (seriesCb) {
        var fn = cleanup.assertRedis([
          [ 'LRANGE', 'messages:myplatform:dm:388636-524376', '-1', '-1' ],
          [ 'HGET', 'messages:myplatform:dm:388636-524376:data', MESSAGE_ID ]
        ], [
          [ MESSAGE_ID ],
          MESSAGE_JSON
        ]);

        fn(seriesCb);
      },

      function (callback) {
        request()
          .post('/user/524376/' + MESSAGE_ID)
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .send({})
          .expect(400)
          .expect('Content-Type', /json/)
          .expect(request.fixErrorStack)
          .expect({
            error: true,
            code: null,
            name: 'ArgumentError',
            message: 'No valid data was supplied',
            stack: [],
            status: 400
          })
          .end(callback);
      }

    ], done);
  });

  it('should return an error if the user is not authenticated correctly', function (done) {
    request()
      .delete('/user/524376/magical-not-found-message-id')
      .set(request.headers)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'NOT_AUTHENTICATED',
        name: 'UnauthenticatedError',
        message: 'You are not authenticated',
        stack: [],
        status: 401
      })
      .end(done);
  });

  it('should return an error if the message to update has an unsupported type', function (done) {
    request()
      .delete('/villain/skynet/some-incorrect-message-id')
      .set(request.headers)
      .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
      .expect(400)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'MESSAGES_INVALID_TARGET',
        name: 'ArgumentError',
        message: 'Invalid target "villain"',
        stack: [],
        status: 400
      })
      .end(done);
  });

  it('should return an error if the user is not authenticated correctly', function (done) {
    request()
      .delete('/user/524376/magical-not-found-message-id')
      .set(request.headers)
      .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
      .expect(404)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'NOT_FOUND',
        name: 'NotFound',
        message: 'Message not found',
        stack: [],
        status: 404
      })
      .end(done);
  });

  it('should successfully delete a message', function (done) {
    var MESSAGE_ID = null;
    var MESSAGE_JSON = null;

    async.series([

      cleanup.redis([
        [ 'DEL', 'messages:myplatform:inbox:388636' ],
        [ 'DEL', 'messages:myplatform:dm:388636-524376', 'messages:myplatform:dm:388636-524376:data' ]
      ]),

      function (callback) {
        mock.usersByIds([ 388636, 524376 ]);

        request()
          .post('/user/524376')
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .send({
            type: 'text',
            text: 'Well hello there Barry!'
          })
          .expect(201)
          .expect('Content-Type', /json/)
          .expect(function (res) {
            if (res.body && res.body.entry && res.body.entry.id) {
              MESSAGE_ID = res.body.entry.id;
              res.body.entry.id = 'MESSAGE_ID';

              MESSAGE_JSON = JSON.stringify({
                id: MESSAGE_ID,
                author: 388636,
                timestamp: (new Date(res.body.entry.timestamp.iso)).toISOString(),
                type: 'text',
                text: 'Well hello there Barry!'
              });

              res.body.entry.timestamp.epoch = 1464947344965;
              res.body.entry.timestamp.iso = '2016-06-03T09:49:04.965Z';
            }
          })
          .expect({
            state: {
              key: 'myplatform:dm:388636-524376',
              inbox_key: 'user-524376'
            },
            entry: {
              id: 'MESSAGE_ID',
              author: 388636,
              timestamp: {
                epoch: 1464947344965,
                iso: '2016-06-03T09:49:04.965Z'
              },
              type: 'text',
              text: 'Well hello there Barry!'
            }
          })
          .end(callback);
      },

      function (seriesCb) {
        var fn = cleanup.assertRedis([
          [ 'LRANGE', 'messages:myplatform:dm:388636-524376', '-1', '-1' ],
          [ 'HGET', 'messages:myplatform:dm:388636-524376:data', MESSAGE_ID ]
        ], [
          [ MESSAGE_ID ],
          MESSAGE_JSON
        ]);

        fn(seriesCb);
      },

      function (callback) {
        request()
          .delete('/user/524376/' + MESSAGE_ID)
          .set(request.headers)
          .set(config.jwt.header, fn.generateRandomToken({ user_id: 388636 }))
          .expect(200)
          .expect('Content-Type', /json/)
          .expect({
            state: {
              key: 'myplatform:dm:388636-524376',
              inbox_key: 'user-524376'
            },
            message: 'Message deleted',
            success: true
          })
          .end(callback);
      },

      function (seriesCb) {
        var fn = cleanup.assertRedis([
          [ 'LRANGE', 'messages:myplatform:dm:388636-524376', '-1', '-1' ],
          [ 'HGET', 'messages:myplatform:dm:388636-524376:data', MESSAGE_ID ]
        ], [
          [],
          null
        ]);

        fn(seriesCb);
      }

    ], done);
  });

  it('should return a 404 if the route is not found', function (done) {
    request()
      .get('/do-something-amazing')
      .set(request.headers)
      .expect(404)
      .expect('Content-Type', /json/)
      .expect(request.fixErrorStack)
      .expect({
        error: true,
        code: 'NOT_FOUND',
        name: 'RouteNotFoundError',
        message: 'Route not found - please check your URL and try again',
        stack: [],
        status: 404
      })
      .end(done);
  });

});
