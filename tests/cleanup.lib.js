var assert = require('assert');
var async = require('async');
var config = require('../src/config');

var redis = require('redis').createClient({
  host: config.redis.host,
  port: config.redis.port,
  prefix: config.redis.prefix + ':'
});

var cleanup = module.exports = function (fns) {
  return function seriesCleanup(callback) {
    async.series(fns, function (err) {
      callback(err);
    });
  };
};

cleanup.parallel = function (fns) {
  return function parallelCleanup(callback) {
    async.parallel(fns, function (err) {
      callback(err);
    });
  };
};

cleanup.redis = function (commands) {
  var multi = redis.multi(commands);

  return function (callback) {
    multi.exec(function (err) {
      callback(err);
    });
  };
};

cleanup.assertRedis = function (commands, expected) {
  var multi = redis.multi(commands);

  return function (callback) {
    multi.exec(function (err, results) {
      if (!err && Array.isArray(results)) results.forEach(function (result, i) {
        assert.deepStrictEqual(result, expected[i],
          'Expected Redis result for ' + commands[i].join(' ') + ' to equal ' + expected[i]);
      });

      callback(err);
    });
  };
};
