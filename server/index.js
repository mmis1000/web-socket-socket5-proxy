var config = require('./config.js');

var port = config.port;

var SocketServer = require('./socket-server.js');

var express = require('express');

var app = express();

var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');


app.get('/', function(req, res){
    res.redirect(config.index);
});

app.use(express.static(path.join(__dirname, config.publicFolder)));

io.on('connection', function(socket){
  console.log('a user connected');
  var socket = new SocketServer(socket);
  socket.debug = true;
});

app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    res.status(err.status || 500);
    res.send('<h1>404 not found.</h1>');
    res.end();
});

app.set('port', process.env.PORT || port);

http.listen(port, function(){
  console.log('listening on *:' + port);
});