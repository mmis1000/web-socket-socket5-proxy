var net = require('net');

/*
function SocketServer(ws) {
    this.webSocket = ws;
    this.socket = null
    this.authed = true;
    
    this.webSocket.on('set_target', this.onWebSocketSetTarget.bind(this));
    
    this.webSocket.on('FIN', this.onWebSocketFIN.bind(this));
    this.webSocket.on('up_stream', this.onWebSocketUpStream.bind(this));
    
}

SocketServer.prototype.onWebSocketSetTarget = function(target) {
    this.log('connectiong to' + target.address + ":" + target.port);
    
    if (!this.authed) {
        this.webSocket.emit('error', 'auth failed');
    }
    
    this.socket = net.(target.port, target.address, this.onSocketConnect.bind(this));
    
    this.socket.on('data', this.onSocketData.bind(this));
    this.socket.on('connect', this.onSocketConnect.bind(this));
    this.socket.on('end', this.onSocketEnd.bind(this));
    this.socket.on('close', this.onSocketClose.bind(this));
    this.socket.on('error', this.onSocketError.bind(this));
};

SocketServer.prototype.onWebSocketFIN = function() {
    this.wsClose();
    this.sClose();
}

SocketServer.prototype.onWebSocketUpStream = function(data) {
    this.log('sending data to dis server...');
    if (!this.socket) {
        this.wsError('not connected');
        return;
    }
    this.socket.write(new Buffer(data, 'base64'));
}

SocketServer.prototype.onSocketData = function(data) {
    dump(data);
    this.log('sending data to client...');
    this.webSocket.emit('down_stream', data.toString('base64'));
};

SocketServer.prototype.onSocketConnect = function() {
    this.log('connected to dis server.');
    this.webSocket.emit('target_setted');
};

SocketServer.prototype.onSocketClose = function() {
    this.wsClose();
    this.sClose();
};

SocketServer.prototype.onSocketEnd = function() {
    this.wsClose();
    this.sClose();
};

SocketServer.prototype.onSocketError = function() {
    this.wsError('error', 'lost connection');
    this.sClose();
};


SocketServer.prototype.wsClose = function() {
    this.webSocket.emit('FIN');
    this.wsDelayClose();
}

SocketServer.prototype.wsError = function(err) {
    this.webSocket.emit('error', 'err');
    this.wsDelayClose();
}

SocketServer.prototype.wsDelayClose =  function(err) {
    var self = this;
    self.log('waiting to stop ws connect...');
    setTimeout(function(){
        self.webSocket.disconnect();
    }, 10000)
}

SocketServer.prototype.sClose = function() {
    this.log('stop socket connect...');
    this.socket.end();
    this.socket.destroy();
}

SocketServer.prototype.log = function(msg) {
    if (this.debug) {
        console.log(msg);
    }
}


function dump(chunk){
  console.log('dumping:');
  console.log(chunk.toString('utf8'));
  
  var res = "";
  
  for (var i = 0; i < chunk.length; i++) {
    res += (chunk[i] > 15 ? "" : "0") + chunk[i].toString(16) + " ";
    if ((i + 1) % 8 === 0) {
        res += "\n";
    }
  }
  
  console.log(res);
  
}

module.exports = SocketServer;
*/

function SocketServer(ws) {
    this.webSocket = ws;
    this.sockets = [];
    this.socketMap = {};
    this.authed = true;
    
    this.debug = true;
    
    this.webSocket.on('new_connection', this.onNewConnection.bind(this));
    this.webSocket.on('clear_connection', this.onClearConnection.bind(this));
}

SocketServer.prototype.onNewConnection = function onNewConnection(data) {
    
    var id = data.sessionId;
    
    this.log(id + " : preparing connection toward " + data.address + ":" + data.port);
    
    var socket = net.createConnection(data.port, data.address);
    socket.sessionId = id;
    this.sockets.push(socket);
    this.socketMap[id] = socket;
    
    this.forwardEvent(id, "connect");
    this.forwardEvent(id, "data");
    this.forwardEvent(id, "end");
    this.forwardEvent(id, "drain");
    this.forwardEvent(id, "error");
    this.forwardEvent(id, "close");
    
    
    this.webSocket.on(id + '-client_write', this.onClientWrite.bind(this));
    this.webSocket.on(id + '-client_end', this.onClientEnd.bind(this));
    this.webSocket.on(id + '-client_destroy', this.onClientDestroy.bind(this));
    
    //console.log(id + '-client_write');
}

SocketServer.prototype.onClearConnection = function onClearConnection(id) {
    var socket, i;
    
    if (!this.socketMap[id]) {
        return false;
    }
    
    this.log(id + " : clearing connection");
    
    //make sure socket were destroyed
    try {
        this.socketMap[id].destroy();
    } catch (e) {}
    
    //make sure all reference were removed
    this.socketMap[id].removeAllListeners();
    
    socket = this.socketMap[id];
    delete this.socketMap[id];
    
    i = this.sockets.indexOf(socket);
    this.sockets.splice(i, 1);
    
}

SocketServer.prototype.onClientWrite = function onClientWrite(data) {
    data = this.unPack_(data);
    id = data.id;
    
    this.log(id + " : client write");
    try {
        this.socketMap[id].write(data.data);
    } catch (e) {
        console.log(data.data, e);
    }
}
SocketServer.prototype.onClientEnd = function onClientEnd(data) {
    data = this.unPack_(data);
    id = data.id;
    
    this.log(id + " : client end");
    
    this.socketMap[id].end(data.data);
}
SocketServer.prototype.onClientDestroy = function onClientDestroy(data) {
    data = this.unPack_(data);
    id = data.id;
    
    this.log(id + " : client destroy");
    
    //this.socketMap[id].destroy();
}

SocketServer.prototype.forwardEvent = function forwardEvent(id, type) {
    var self = this
    function callback () {
        var args = Array.prototype.slice.call(arguments, 0);
        self.log(id + " : forwarding event [" + type + "]");
        self.webSocket.emit.apply(
            self.webSocket, 
            [id + "-" + type].concat(args)
        );
    }
    this.socketMap[id].on(type, callback);
}

SocketServer.prototype.log = function(str) {
    if (this.debug) {
        console.log(str);
    }
}

SocketServer.prototype.unPack_ = function (str) {
    var data = JSON.parse(str);
    if (data.data !== undefined) {
        data.data = new Buffer(data.data, 'base64');
    }
    return data;
}

module.exports = SocketServer;