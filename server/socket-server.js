var EventEmitter = require('events').EventEmitter;
var util = require('util');

var net = require('net');


function padding(str, fill, length) {
    while (str.length < length) {
        str = fill + str;
    }
    return str
}

function getId() {
    return padding(Math.floor(0xffffffff * Math.random()).toString(16), "0", 8)
}

function SocketServer(ws) {
    this.webSocket = ws;
    this.sockets = [];
    this.socketMap = {};
    this.authed = true;
    
    this.sessionId = getId();
    
    this.createTime =  Date.now();
    
    this.timeout = 15 * 60 * 1000;
    this.lastPing = Date.now();
    
    this.debug = true;
    this.isAlive = true;

    this.webSocket.on('new_connection', this.onNewConnection.bind(this));
    this.webSocket.on('client_ping', this.onClientPing.bind(this));
    
    this.timeoutListenerId = setInterval(this.checkTimeout.bind(this), this.timeout);
    this.onceConnect();
}

util.inherits(SocketServer, EventEmitter);

SocketServer.prototype.onceConnect = function onceConnect() {
    this.webSocket.emit('init_session', this.sessionId);
};

SocketServer.prototype.checkTimeout = function checkTimeout() {
    this.log('check timeout for ' + this.sessionId);
    if (this.lastPing + this.timeout < Date.now()) {
        this.log('timeout happened for ' + this.sessionId);
        this.destroy();
    }
};

SocketServer.prototype.onClientPing = function onClientPing() {
    this.log('client ping!');
    this.lastPing = Date.now();
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
    
    this.socketMap[id].once("close", function() {
        /*
            these things can handle before client request
            so we can release socket resource as soon as possible.
        */
        this.onSocketClose(id)
    }.bind(this))
    
    this.webSocket.on(id + '-client_write', this.onClientWrite.bind(this));
    this.webSocket.on(id + '-client_end', this.onClientEnd.bind(this));
    this.webSocket.on(id + '-client_destroy', this.onClientDestroy.bind(this));
    
    socket.listendEvents = [];
    socket.listendEvents.push(id + '-client_write');
    socket.listendEvents.push(id + '-client_end');
    socket.listendEvents.push(id + '-client_destroy');
    //console.log(id + '-client_write');
}

SocketServer.prototype.onSocketClose = function onSocketClose(id) {

    if (!this.socketMap[id]) {
        return false;
    }
    
    try {
        this.socketMap[id].destroy();
    } catch (e) {}
        
    try {
        this.onClearConnection(id);
    } catch (e) {}
};

SocketServer.prototype.onClearConnection = function onClearConnection(id) {
    var socket, i;
    
    this.log(id + " : clearing connection");
    
    //make sure all reference were removed
    this.socketMap[id].removeAllListeners();
    
    socket = this.socketMap[id];
    delete this.socketMap[id];
    
    i = this.sockets.indexOf(socket);
    this.sockets.splice(i, 1);
    
    socket.listendEvents.forEach(function(ev) {
        this.webSocket.removeAllListeners(ev);
    }.bind(this));
}

SocketServer.prototype.dieConnection = function dieConnection(id, reason) {
};

SocketServer.prototype.onClientWrite = function onClientWrite(data) {
    data = this.unPack_(data);
    var id = data.id;
    if (!this.socketMap[id]) {
        this.log(id + ' : unexpect write call after socket closed!');
        return false;
    }
    
    this.log(id + " : client write");
    try {
        this.socketMap[id].write(data.data);
    } catch (e) {
        console.log(data.data, e);
    }
}
SocketServer.prototype.onClientEnd = function onClientEnd(data) {
    data = this.unPack_(data);
    var id = data.id;
    if (!this.socketMap[id]) {
        this.log(id + ' : unexpect end call after socket closed!');
        return false;
    }
    
    this.log(id + " : client end");
    
    this.socketMap[id].end(data.data);
}
SocketServer.prototype.onClientDestroy = function onClientDestroy(data) {
    data = this.unPack_(data);
    var id = data.id;
    
    this.log(id + " : client destroy");
    
    this.onSocketClose(id);
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

SocketServer.prototype.destroy = function destroy() {
    clearInterval(this.timeoutListenerId);
    this.sockets.forEach(function(socket){
        try {
            socket.destroy();
        } catch (e) {}
        try {
            socket.removeAllListeners();
        } catch (e) {}
    });
    this.sockets = null;
    this.socketMap = null;
    this.webSocket.removeAllListeners();
    
    try {
        this.webSocket.disconnect(true);
    } catch (e) {
        console.log(e);
    }
    
    this.webSocket = null;
    
    console.log('shuting down connections');
    
    this.isAlive = false;
    this.emit('destroy', this.sessionId);
}
module.exports = SocketServer;