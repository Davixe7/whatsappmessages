const express    = require('express');
const http       = require('http')
const cors       = require('cors')
const { Server } = require('socket.io');

const app    = express()
app.use(cors())

const server = http.createServer(app)
const io     = new Server(server, {
  cors: {
    origin: "https://phenlinea.com",
    methods: ["GET", "POST"],
    credentials: true
  }
})

io.on('connection', (socket) => {
  console.log('a user connected');
});

require('./api')(app, io)

server.listen(3000, () => console.log('Hello, newbie!')) 
