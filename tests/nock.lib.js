var config = require('../src/config');
var mock = module.exports = {};
var nock = require('nock');

mock.authenticateUser = function (user_id, role) {
  return nock(config.api.baseUrl)
    .get('/v1/session')
    .reply(200, {
      session: {
        id: '9734f2f88607ef5630d6275dc7bf3170'
      },
      user: {
        id: user_id,
        username: 'Barry from Earth-' + user_id,
        role: {
          id: 0,
          handle: role.toLowerCase(),
          name: role
        }
      }
    });
};

mock.topicsByIds = function (entry_ids) {
  return nock(config.api.baseUrl)
    .get('/v1/topics')
    .query({
      fields: 'id,title,status',
      ids: entry_ids.join(',')
    })
    .reply(200, {
      entries: entry_ids.map(function (entry_id) {
        return {
          id: entry_id,
          title: 'Example Topic #' + entry_id,
          status: 'published'
        };
      })
    });
};

mock.usersByIds = function (entry_ids) {
  return nock(config.api.baseUrl)
    .get('/v1/users')
    .query({
      fields: 'id,username,role',
      ids: entry_ids.join(',')
    })
    .reply(200, {
      entries: entry_ids.map(function (entry_id) {
        return {
          id: entry_id,
          username: 'Barry from Earth-' + entry_id,
          role: {
            id: 3,
            handle: 'registered',
            value: 'Registered'
          }
        };
      })
    });
};
