var config = require('./config.js');

var SocketServer = require('./socket-server.js');

var express = require('express');

var logger = require('morgan');

var path = require('path');

var app = express();

var http = require('http').Server(app);
var io = require('socket.io')(http);

var manager = new (require('./manager.js'))()

var port = config.port;

app.use(logger('dev'));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.get('/', function(req, res){
    res.redirect(config.index);
});

if (config.statsHTML) {
    app.get(config.statsHTML, function(req, res) {
        res.render('stats', manager.getStat())
    });
}
if (config.statsJSON) {
    app.get(config.statsJSON, function(req, res) {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(manager.getStat(), null, 4));
    });
}
app.use(express.static(path.join(__dirname, config.publicFolder)));

io.on('connection', function(socket){
  console.log('a user connected');
  var socket = new SocketServer(socket);
  manager.add(socket);
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