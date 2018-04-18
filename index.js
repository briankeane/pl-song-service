const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const services = require('./lib/services')
const handlers = require('./lib/handlers')
const events = require('./lib/events')
const mongoose = require('mongoose')
const memwatch = require('memwatch-next')



console.log('BASE URL: ------------------ ', process.env.BASE_URL)
const connectToMongo = () => {
  mongoose.connect(process.env.MONGODB_URI, { autoReconnect: true }, function (err) {
    console.log('mongoose connected!')
    console.log('err? ', err)
  });
  mongoose.connection.on('error', function(err) {
    console.error(`MongoDB connection error: ${err}`);
    setTimeout(connectToMongoose, 1000)
  });
}
connectToMongo()

app.all('*', function(req, res, next) {
  res.header('Access-Control-Allow-Credentials', true)
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
  res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization')
  if ('OPTIONS' === req.method) {
    res.status(200).end()
  } else {
    next()
  }
})

app.set('port', (process.env.PORT || 3000))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

const versions = process.env.API_VERSIONS.split(',')
for (let version of versions) {
  let routes = require(`./routes/${version}/routes.js`)
  app.use(`/${version}`, routes)
}

app.listen(app.get('port'), () => {
  console.log(`Example app listening on port ${app.get('port')}!`)

  /**
   * This is the current paradigm for subscribing and publishing between services.
   *
   * Services contain a group of event streams we defined in `services.js` that we would like
   * to connect to. When all these connections have been made we are safe to publish and
   * subscribe to events from each stream.
   */
  const connectToServices = () => {
    services.connect().then(() => {
    console.log('connected to amqlib')
    //   *
    //    * We can call each service by its name and subscribe or publish directly to that service's
    //    * message queue. We define the event names in the `events.js` file. Similarly, we also
    //    * move the processing of the event to a file called `handlers.js`.
       
      services.songRequest.subscribe(
        events.SONGREQUEST_SPOTIFYINFO_RECEIVED,
        handlers.onSpotifyInfoReceived
      )

      services.songRequest.subscribe(
        events.SONGREQUEST_SPOTIFYINFO_FAILED,
        handlers.onSpotifyInfoFailed
      )

      services.songRequest.subscribe(
        events.SONGREQUEST_YOUTUBEINFO_RECEIVED,
        handlers.onYouTubeInfoReceived
      )

      services.songRequest.subscribe(
        events.SONGREQUEST_YOUTUBEINFO_FAILED,
        handlers.onYouTubeInfoFailed
      )

      services.song.subscribe(
        events.SONG_CREATED,
        handlers.onSongCreated
      )

      // set max prefetch to avoid overloading heroku memory
      for (let service of services.streams) {
        service.channel.prefetch(50)
      }
    }).catch(error => {
      console.log('error connecting to services.  retrying after 1 sec')
      setTimeout(connectToServices, 1000)
    })
  }
  connectToServices()
})

memwatch.on('leak', (info) => {
  console.error('Memory leak detected:\n', info);
});

// explicitly log stack trace for unhandled rejections
process.on('unhandledRejection', (err, p) => {
  console.log(err)
})
