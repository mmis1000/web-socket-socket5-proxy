// http://www.ietf.org/rfc/rfc1928.txt

// Tested with: curl http://www.google.se/ --socks5 1080 --proxy-user foo:bar
var config = require('./config.js');

var wsServer = config.wsServer;

var States = {
  CONNECTED:0,
  VERIFYING:1,
  READY:2,
  PROXY: 3
};
var AuthMethods = {
  NOAUTH:0,
  GSSAPI:1,
  USERPASS:2
}
var CommandType ={
  TCPConnect:1,
  TCPBind:2,
  UDPBind:3
}
var AddressTypes = {
  IPv4: 0x01,
  DomainName: 0x03,
  IPv6: 0x04,

  read: function(buffer,offset){
    if(buffer[offset] == AddressTypes.IPv4){
      return buffer[offset+1] + "." +
             buffer[offset+2] + "." +
             buffer[offset+3] + "." +
             buffer[offset+4];
    }else if(buffer[offset] == AddressTypes.DomainName){
      //console.log(offset, buffer[offset+1], offset+2+buffer[offset+1], buffer.length);
      var start = offset + 2;
      var end = offset + 2 + buffer[offset+1];
      
      //console.log(offset, start, end, buffer.length);
      
      var domain = buffer.slice(start, end).toString('utf8');
      //console.log(domain)
      return domain;
    }else if(buffer[offset] == AddressTypes.IPv6){
      return buffer.slice(buffer[offset+1], buffer[offset+1+16])
    }
  },

  sizeOf: function(buffer,offset){
    if(buffer[offset] == AddressTypes.IPv4){
        return 4;
      }else if(buffer[offset] == AddressTypes.DomainName){
        return buffer[offset+1];
      }else if(buffer[offset] == AddressTypes.IPv6){
        return 16;
      }
   }
}
var net_ = new (require('./web-socket.js'))(wsServer, config.internalProxyPort, config.httpProxy);
var net = require('net')
var clients = [];

function accept(socket){
  console.log('request comes!');//deubg
  clients.push(socket);
  socket.pstate = States.CONNECTED;
  
  /*
  it is no always that the client got a end event), 
  and can thus cause potential memory leak.
  So ,also listen to "close".
  */
  socket.on('end',function(){
    clients.splice(clients.indexOf(socket),1);
  });
  socket.on('close',function(){
    if (clients.indexOf(socket) >= 0) {
      clients.splice(clients.indexOf(socket),1);
    }
  });
  var handshake = function(chunk){
    console.log('start handshake!');//deubg
    socket.removeListener('data',handshake);
    //SOCKS Version
    if(chunk[0]!= 5){
      console.log('Wrong version.', chunk[0]);//debug
      socket.end();
      return;
    }
    n= chunk[1]; // Number of auth methods

    socket.methods=[];
    for(i=0;i<n;i++){
      socket.methods.push(chunk[2+i]);
    }
    
    //console.log('AuthMethods: ' + JSON.stringify(socket.methods));//debug

    var resp = new Buffer(2);
    resp[0] = 0x05;
    if(socket.methods.indexOf(AuthMethods.NOAUTH) >= 0){
      //console.log('start bind handle!');//deubg
      socket.handleRequest=handleRequest.bind(socket);
      socket.on('data',socket.handleRequest);
      socket.pstate=States.READY;
      resp[1] = AuthMethods.NOAUTH;
      socket.write(resp);
      
      /*
      resp = new Buffer(2);
      resp[0]=1; //Version
      resp[1]=0x00;
      socket.write(resp);
     */
     
    }else{
      resp[1]=0xFF
      console.log('auth error unknown method : ' + socket.methods);//debug
      socket.end(resp);
    }
  }
  socket.on('data',handshake);
}

function authUSERPASS(chunk){
 console.log("starting authUSERPASS!");//debug
 this.removeListener('data',this.authUSERPASS);
 resp = new Buffer(2);
 resp[0]=1; //Version
 resp[1]=0xff;
 if(chunk[0] != 1){
   this.end(resp); // Wrong auth version, closing connection.
   return;
 }
 nameLength= chunk[1];
 username= chunk.toString('utf8',2,2+nameLength);

 passLength=chunk[2+nameLength];
 password= chunk.toString('utf8',3+nameLength,3+nameLength+passLength);
 //console.log('Authorizing: '+username);
 if(authorize(username,password)){
   this.pstate=States.READY;
   this.handleRequest=handleRequest.bind(this);
   this.on('data',this.handleRequest);
   resp[1]=0x00;
   this.write(resp);
   //console.log('Accepted');
 }else{
   this.end(resp);
   //console.log('Denied');
 }

}
function authorize(username,password){
 return true;
}

function handleRequest(chunk){
  //console.log('start handleRequest!');//deubg
  this.removeListener('data',this.handleRequest);
  //dump(chunk);
  if(chunk[0] != 5){
    chunk[1] = 0x01;
    this.end(chunk); // Wrong version.
    console.log('Wrong version.', chunk[0]);//debug
    return;
  }
  offset = 3;
  var address = AddressTypes.read(chunk,offset);
  
  offset = chunk.length - 2;
  
  //console.log(offset)//debug
  
  var port = chunk.readUInt16BE(offset);
  
  //console.log('Request', chunk[1], " to: "+ address+":"+port);//debug

  if(chunk[1]== CommandType.TCPConnect){
    this.request = chunk;
     console.log('start proxy!');//deubg
    this.proxy =  net_.createConnection(port,address,initProxy.bind(this));
    
    /*these handles should bind before the proxy start, since they may fire before proxy init, and crash the whole server*/
    this.on('error',function(err){
      console.log(err)
    }.bind(this));
    this.proxy.on('error',function(err){
      console.log(err);
    }.bind(this));
    
    this.proxy.on('close',function(err){
      this.proxy.destroy();
      this.destroy();
      
      process.nextTick(function(){
        this.proxy.removeAllListeners();
        this.removeAllListeners();
      }.bind(this)); 
    }.bind(this));
    
    this.on('close',function(err){
      this.proxy.destroy();
      this.destroy();
      
      process.nextTick(function(){
        this.proxy.removeAllListeners();
        this.removeAllListeners();
      }.bind(this)); 
    }.bind(this));

  }else{
    this.end(chunk);
  }
}

function initProxy(){
  //console.log('Proxy Connected');
  var resp = new Buffer(this.request.length);
  this.request.copy(resp);
  resp[1]=0x00;
  this.write(resp);
  
  this.proxy.on('data', function(data){
    console.log('send data to local');
    this.write(data);
  }.bind(this));
  
  this.on('data',function(data){
    console.log('send data to dest server');
    this.proxy.write(data);
  }.bind(this));
  
  
  this.proxy.on('end',function(err){
    this.end();
  }.bind(this));
  
  this.on('end',function(err){
    this.proxy.end();
  }.bind(this));
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


var server= net.createServer(accept);
server.listen(config.proxyPort);

server.on('error', function(err) {
    console.log(err);
});

process.on('uncaughtException', function (err) {
  console.error(err.stack);
  console.log("Node NOT Exiting...");
});