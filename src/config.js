var debug = require('debug')('SennaSockets:Config');

var config = {

  environment: process.env.SOCK_ENV || process.env.NODE_ENV || 'development',
  isDevelopment: false,
  isProduction: false,

  domain: {
    handle: process.env.SOCK_DOMAIN_HANDLE || 'myplatform'
  },

  http: {
    host: process.env.SOCK_HTTP_HOST || 'localhost',
    port: process.env.SOCK_HTTP_PORT || 3005
  },

  redis: {
    host: process.env.SOCK_REDIS_HOST || 'localhost',
    port: process.env.SOCK_REDIS_PORT || 6379,
    prefix: process.env.SOCK_REDIS_PREFIX || 'senna-sockets'
  },

  jwt: {
    algorithm: process.env.SOCK_JWT_ALGORITHM || 'HS256',
    header: process.env.SOCK_JWT_HEADER || 'X-Auth-Token',
    secret: process.env.SOCK_JWT_SECRET || 'scene-passage-love-rhyme'
  },

  api: {
    baseUrl: process.env.SOCK_API_URL || 'http://localhost:3000/',
    user_agent: process.env.SOCK_API_USER_AGENT || 'Senna-Sockets-Server'
  },

  messages: {
    prefix: 'messages'
  },

  introductions: [
    'Hello, I am Baymax, your personal healthcare companion.',
    'I cannot deactivate until you say you are satisfied with your care.',
    'Tadashi is here.',
    'Flying makes me a better healthcare companion.',
    '👊 Balalala!'
  ]

};

config.isDevelopment = config.environment === 'development';
config.isProduction = config.environment === 'production';

debug(config);
module.exports = config;
