Object.assign(process.env, require('./env.json'));

var config = require('../src/config');
var crypto = require('crypto');
var jwt = require('jsonwebtoken');

module.exports.generateToken = function (payload) {
  return jwt.sign(payload, config.jwt.secret, { algorithm: config.jwt.algorithm, noTimestamp: true });
};

module.exports.generateRandomToken = function (payload) {
  return module.exports.generateToken(Object.assign(payload, { random: crypto.randomBytes(256).toString('hex') }));
};

if (!module.parent) {
  console.log(module.exports.generateToken({ // jshint ignore:line
    user_id: 388636
  }));
}
