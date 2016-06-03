# Senna-Sockets

> Q: How much effort is it to include "realtime" chat into your application / platform

Answer: Really not that much!

## About

This is an implementation of a chat API, storing data in [Redis](http://redis.io) & communicating in realtime using
[Socket.IO](http://socket.io). It works with clients using a REST API & uses [JSON Web Tokens](https://jwt.io) for
authentication.

**Note:** This assumes you already use JWTs in your platform, which means we don't need to sign new tokens here. If
your platform doesn't use JWT as it's authentication, you'll need to change the `authentication` middleware function to
suit your needs accordingly.

## Usage

```
$ git clone ... # (or download the ZIP, whatever you'd prefer)
$ npm install
$ npm start
```

You can override various configuration options with environment variables, like so:

```
$ SOCK_HTTP_PORT=8080 npm start
```

Check out [the config file](./src/config.js) for a full list of all the variables you can overwrite. If you using JWTs
then you'll probably want to override the JWT secret (`SOCK_JWT_SECRET`) so you can use your existing tokens :wink:

## API

### Get a list of messages

This endpoint returns a page of chats, sorted by most recent, and includes information about the chat & the most recent
message in the chat.

```http
GET /api/list
X-Auth-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozODg2MzZ9.UOFA3A6iCHN62Iobv-5WAzb95uRWuRn8nslhNPMfLz4

HTTP/1.1 200 OK
Content-Type: application/json
{
  "state": {
    "key": "carthrottle:inbox:388636",
    "page": 1,
    "per_page": 10,
    "total": 2,
    "total_pages": 1
  },
  "entries": [
    {
      "type": "user",
      "id": 342676,
      "latest": {
        "id": "215066e1-e4a6-4a67-93b3-372519f7dfff",
        "author": 342676,
        "timestamp": {
          "epoch": 1464896060713,
          "iso": '2016-06-02T21:42:36.342Z'
        },
        "type": 'text',
        "text": 'Hello, world!'
      },
      "timestamp": {
        "epoch": 1464896060713,
        "iso": "2016-06-02T21:42:36.342Z"
      },
      "user": {
        "id": 342676,
        "username": "Barry from Earth-342676",
        "role": {
          "id": 3,
          "handle": "registered",
          "value": "Registered"
        }
      }
    },
    {
      "type": "user",
      "id": 524376,
      "latest": {
        "id": "215066e1-e4a6-4a67-93b3-372519f7dfff",
        "author": 524376,
        "timestamp": {
          "epoch": 1464903576342,
          "iso": '2016-06-02T21:39:36.342Z'
        },
        "type": 'text',
        "text": 'Hello, world!'
      },
      "timestamp": {
        "epoch": 1464857720713,
        "iso": "2016-06-02T08:55:20.713Z"
      },
      "user": {
        "id": 524376,
        "username": "Barry from Earth-524376",
        "role": {
          "id": 3,
          "handle": "registered",
          "value": "Registered"
        }
      }
    }
  ]
}
```

You can paginate through results with `page` and `per_page` query strings, which should be integers.

### Get a chat history

```http
GET /api/user/524376
X-Auth-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozODg2MzZ9.UOFA3A6iCHN62Iobv-5WAzb95uRWuRn8nslhNPMfLz4

HTTP/1.1 200 OK
Content-Type: application/json
{
  "state": {
    "key": "carthrottle:dm:388636-524376",
    "page": 1,
    "per_page": 10,
    "total": 2,
    "total_pages": 1
  },
  "messages": [
    {
      "id": "215066e1-e4a6-4a67-93b3-372519f7dfff",
      "author": {
        "id": 388636,
        "username": "Barry from Earth-388636",
        "role": {
          "id": 3,
          "handle": "registered",
          "value": "Registered"
        }
      },
      "timestamp": {
        "epoch": 1464903516342,
        "iso": "2016-06-02T21:38:36.342Z"
      },
      "type": "text",
      "text": "Whaddup Barry!"
    },
    {
      "id": "67d7fb6b-26b1-4972-a34d-67c0533e7e17",
      "author": {
        "id": 524376,
        "username": "Barry from Earth-524376",
        "role": {
          "id": 3,
          "handle": "registered",
          "value": "Registered"
        }
      },
      "timestamp": {
        "epoch": 1464903576342,
        "iso": "2016-06-02T21:39:36.342Z"
      },
      "type": "text",
      "text": "Hey, Barry!!"
    }
  ]
}
```

Again, you can paginate through results with `page` and `per_page` query strings, which should be integers.

### Sending messages

```http
POST /api/user/524376
X-Auth-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozODg2MzZ9.UOFA3A6iCHN62Iobv-5WAzb95uRWuRn8nslhNPMfLz4
{
  "type": "text"
  "text": "Hello, world!"
}

HTTP/1.1 201 OK
Content-Type: application/json
{
  "state": {
    "key": "carthrottle:dm:388636-524376",
    "inbox_key": "user-524376"
  },
  "entry": {
    "id": "215066e1-e4a6-4a67-93b3-372519f7dfff",
    "author": 388636,
    "timestamp": {
      "epoch": 1464903516342,
      "iso": "2016-06-02T21:38:36.342Z"
    },
    "type": "text",
    "text": "Hello, world!"
  }
}
```

### Updating a message

```http
POST /api/user/524376/215066e1-e4a6-4a67-93b3-372519f7dfff
X-Auth-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozODg2MzZ9.UOFA3A6iCHN62Iobv-5WAzb95uRWuRn8nslhNPMfLz4
{
  "text": "Can't believe I started this chat with \"Hello, world!\" 😢"
}

HTTP/1.1 200 OK
Content-Type: application/json
{
  "state": {
    "key": "carthrottle:dm:388636-524376",
    "inbox_key": "user-524376"
  },
  "entry": {
    "id": "215066e1-e4a6-4a67-93b3-372519f7dfff",
    "author": 388636,
    "timestamp": {
      "epoch": 1464903516342,
      "iso": "2016-06-02T21:38:36.342Z"
    },
    "type": "text",
    "text": "Can't believe I started this chat with \"Hello, world!\" 😢"
  }
}
```

### Deleting a message

```http
DELETE /api/user/524376/215066e1-e4a6-4a67-93b3-372519f7dfff
X-Auth-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozODg2MzZ9.UOFA3A6iCHN62Iobv-5WAzb95uRWuRn8nslhNPMfLz4

HTTP/1.1 200 OK
Content-Type: application/json
{
  "state": {
    "key": "carthrottle:dm:388636-524376",
    "inbox_key": "user-524376"
  },
  "message": "Message deleted",
  "success": "true"
}
```

## Notes

- Information about "users" (through either the `message.author` properties or `chats[n].user` properties) come directly
  from our API, which means this implementation runs alongside our platform, and isn't integrated into it. This also
  means that you can integrate it into your own platform by changing the requests made by [the model](./src/model.js) -
  just ensure that your API returns results in a timely manner and you won't experience any significant delays[1].

- You should also notice the lack of authentication when fetching data. This is all public data, available for our
  website &amp; our apps, and it's nothing you can't get from visiting our website. But when implementing your own model
  & API requests be sure to lock-down all your secure data!

- The `authentication` middleware refers to a domain, `req.domain`. This exists so you can run this chat platform across
  all of your domains, at the same scale, changing _all_ the keys on a per-domain level, so all chats exists separately
  in your Redis instance. Feel free to leave that, or override `req.domain` as you see fit (just make sure `req.domain
  .handle`) is a string that will be inserted as a prefix for your messages :smile:

----

- [1]: Now, obviously it would make more sense to integrate a service like this, which fetches data from the core of
  your platform, into the platform itself. However, this implementation is designed to run independently of any platform
  for demonstration (and autoscaling) reasons.
