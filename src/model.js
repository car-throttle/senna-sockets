var config = require('./config');
var model = module.exports = {};
var request = require('request');

model.UNAUTHENTICATED_ERR = {
  code: 'NOT_AUTHENTICATED',
  name: 'UnauthenticatedError',
  message: 'Not authenticated',
  status: 401,
  user_message: 'You are not authenticated'
};

model.formatMessage = function (message) {
  if (!message || !message.id) return null;

  message.timestamp = model._formatTimestamp(message.timestamp);

  return message;
};

model.getTopicsByIds = function (topic_ids, callback) {
  request({
    baseUrl: config.api.baseUrl,
    json: true,
    timeout: 5000,

    url: '/v1/topics',
    headers: {
      'User-Agent': config.api.user_agent
    },
    query: {
      fields: 'id,title,status',
      ids: topic_ids.join(',')
    }
  }, function (err, res, result) {
    if (err || !result || !Array.isArray(result.entries)) handleApiError(err, res, result, callback);
    else callback(null, result.entries);
  });
};

model.getUsersById = function (user_ids, callback) {
  request({
    baseUrl: config.api.baseUrl,
    json: true,
    timeout: 5000,

    url: '/v1/users',
    headers: {
      'User-Agent': config.api.user_agent
    },
    query: {
      fields: 'id,username,role',
      ids: user_ids.join(',')
    }
  }, function (err, res, result) {
    if (err || !result || !Array.isArray(result.entries)) handleApiError(err, res, result, callback);
    else callback(null, result.entries);
  });
};

model._formatError = function (err, opts) {
  if (opts) for (var prop in opts) if (opts.hasOwnProperty(prop)) err[prop] = opts[prop];
  return err;
};

model._formatTimestamp = function (timestamp) {
  if (!timestamp) return null;

  timestamp = new Date(timestamp);
  return {
    epoch: timestamp.getTime(),
    iso: timestamp.toISOString()
  };
};

var handleApiError = function (err, res, result, callback) {
  if (err) callback(err);
  else if (res && res.statusCode && result && result.error) callback(model._formatError(new Error(), result));
  else callback(new Error('Incorrect'));
};
