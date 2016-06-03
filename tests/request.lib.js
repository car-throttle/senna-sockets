var supertest = require('supertest');
var util = require('util');

var route = (function () {
  var app = require('express')();
  app.use('/', require('../src/api'));
  return app;
})();

var request = module.exports = function () {
  return supertest(route);
};

/**
 * > if (res.body && res.body.stack) res.body.stack = []];
 * WHY ARE STACK TRACES SET TO AN EMPTY ARRAY, I heard you ask.
 * Because the absolute paths of our scripts vary, genius.
 * And stack traces are invisible in the production environment.
 */
request.fixErrorStack = function fixErrorStack(res) {
  if (res && res.body && res.body.stack) res.body.stack = [];
};

request.headers = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Host': 'localhost',
  'User-Agent': 'mocha-tester'
};

request.print = function (res) { // jshint ignore:line
  if (!res) console.log(null); // jshint ignore:line
  else console.log(util.inspect({ // jshint ignore:line
    status: res.statusCode,
    headers: res.headers,
    body: res.body
  }, { depth: 5 }));
};
