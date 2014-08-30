var EventEmitter = require('events').EventEmitter;
var util = require('util');
var SocketIoClient = require('socket.io-client');
var ProxyHelper = require('./proxy-helper.js');

var proxyHelper = new ProxyHelper;

function padding(str, fill, length) {
    while (str.length < length) {
        str = fill + str;
    }
    return str
}

function getId() {
    return padding(Math.floor(0xffffffff * Math.random()).toString(16), "0", 8)
}

var encrypter = function encrypter() {}

encrypter.prototype.encrypt = function (obj) {
    return obj;
}
encrypter.prototype.decrypt = function (obj) {
    return obj;
}

/*
    event
    
    client: 
        create : {address, port}
    
    
    server:
        connect : {session}
        end : {session}
        
*/

var WebSocketClient = function(ioClient) {
    this.ioClient  = ioClient;
    this.connections = {};
    this.usedEvents = {}
    
    this.ioClient.on('connect', function(){
        console.log('underlying connection established');
    });
}

WebSocketClient.prototype.requestConnection = function requestConnection(id, ip, port) {
    this.ioClient.emit("new_connection", {
        address: ip,
        port : port,
        sessionId : id
    });
}

WebSocketClient.prototype.clearConnection = function clearConnection(id) {
    var i
    var events = this.usedEvents[id];
    if (!events) {return;}
    for (i = events.length - 1; i >= 0; i--) {
        this.ioClient.removeAllListeners(events[i])
    }
    delete this.usedEvents[id];
    this.ioClient.emit('clear_connection', id);
}

WebSocketClient.prototype.on =
WebSocketClient.prototype.listen = function listen(id, event, callback) {
    this.usedEvents[id].push(id + "-" + event);
    this.ioClient.on(id + "-" + event, callback);
} 

WebSocketClient.prototype.emit = function emit(id, event) {
    args = Array.prototype.slice.call(arguments, 2);
    
    //console.log([id + "-" + event].concat(args));
    
    this.ioClient.emit.apply(this.ioClient, [id + "-" + event].concat(args))
} 

WebSocketClient.prototype.createSocket = function createSocket(port, address, func) {
    var id = getId();
    this.usedEvents[id] = [];
    
    console.log('create socket to ' + address + ":" + port);
    
    var socket = new Socket(this, id, address, port);
    if (typeof func === "function") {
        socket.once('connect', func);
    }
    return socket
}


var Socket = function(socketClient, id, ip, port) {
    this.scClient = socketClient;
    this.sessionId = id;
    
    this.address = ip;
    this.port = port;
    
    if (socketClient.ioClient.connected) {
        socketClient.requestConnection(this.sessionId, this.address, this.port);
    } else {
        socketClient.ioClient.once("connect", (function(){
            socketClient.requestConnection(this.sessionId, this.address, this.port);
        }).bind(this))
    }
    
    this.forwardEvent_("connect");
    this.forwardEvent_("data");
    this.forwardEvent_("end");
    this.forwardEvent_("drain");
    this.forwardEvent_("error");
    this.forwardEvent_("close");
    
    this.on('close', (function(){
        this.scClient.clearConnection(this.sessionId);
        this.log('closed')
    }).bind(this))
    
    this.debug = true;
};

util.inherits(Socket, EventEmitter);

Socket.prototype.write = function write(data) {
    //dump(data);
    this.log('write');
    this.scClient.emit(this.sessionId, "client_write", this.pack_(this.sessionId, data))
}

Socket.prototype.end = function end(data) {
    //dump(data);
    this.log('end');
    this.scClient.emit(this.sessionId, "client_end", this.pack_(this.sessionId, data))
}

Socket.prototype.destroy = function destroy() {
    //dump(data);
    this.log('destroy');
    this.scClient.emit(this.sessionId, "client_destroy",  this.pack_(this.sessionId));
    this.scClient.clearConnection(this.sessionId);
}

Socket.prototype.forwardEvent_ = function forwardEvent_(event) {
    //dump(data);
    var self = this;
    function listener_() {
        self.log("forwarding event [" + event + "]");
        var args = Array.prototype.slice.call(arguments, 0);
        self.emit.apply(self, [event].concat(args));
    }
    this.scClient.on(this.sessionId, event, listener_);
}

Socket.prototype.pack_ = function pack_(id, data) {
    //dump(data);
    if (data !== undefined) {
        return JSON.stringify({id : id, data : data.toString("base64")});
    } else {
        return JSON.stringify({id : id});
    }
}

Socket.prototype.log = function log(msg) {
    //dump(data);
    if (this.debug) {
        console.log(this.sessionId + " : " + msg);
    }
}

/*
var WebSocket = function(EventEmitter) {
    Socket = function () {
        EventEmitter.apply(this);
        if (typeof this.init === "function") {
            this.init.apply(this, arguments);
        }
    };
    for (i in EventEmitter.prototype) {
        if (i !== "construtor") {
            Socket.prototype[i] = EventEmitter.prototype[i];
        }
    }
    return Socket;
} (EventEmitter);

WebSocket.prototype.init = function (wsServer, port, address) {
    var self = this;
    this.ioClient = SocketIoClient(wsServer);
    
    this.ioClient.on('connect', function(){
        self.ioClient.emit('set_target', {port: port, address: address});
    })
    
    this.ioClient.on('target_setted', function(){
        self.emit('connect');
    })
    
    this.ioClient.on('down_stream', function(data){
        console.log('got data from server...')
        data = new Buffer(data, 'base64')
        dump(data);
        self.emit('data', data);
    });
    
    this.ioClient.on('connect_error', function(err){
        self.emit('error', err);
        self.emit('close');
        self.close();
    });
    this.ioClient.on('FIN', function(){
        self.emit('end');
        self.emit('close');
        self.close();
    });
    this.ioClient.on('error', function(err){
        self.emit('error', err);
        self.close();
    });
    
}

WebSocket.prototype.write = function(data) {
    dump(data);
    this.ioClient.emit('up_stream', data.toString('base64'));
    //this.ioClient.emit('FIN');
}

WebSocket.prototype.destroy = function() {
    this.ioClient.disconnect();
    this.ioClinet.destroy();
    this.ioClient = null;
}

WebSocket.prototype.close = function() {
    this.ioClient.emit('FIN');
    this.ioClient.disconnect();
    this.ioClient = null;
}

function Net(wsServer) {
    return {
        createConnection : function(port, address, func) {
            var ws = new WebSocket(wsServer, port, address);
            ws.on('connect', function() {
                func();
            })
            return ws;
        }
    };
}

*/


function Net(wsServer, proxyPort, proxyURL) {

    proxyHelper.init(proxyURL, proxyPort);

    wsServer = proxyHelper.solve(wsServer)
    
    var webSocketClient = new WebSocketClient(SocketIoClient(wsServer));
    return {
        createConnection : function(port, address, func) {
            ws = webSocketClient.createSocket(port, address, func)
            return ws;
        }
    };
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
module.exports = Net;
