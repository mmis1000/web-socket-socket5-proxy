/*
    special thanks to ymx
    https://github.com/ymx/socket.io-proxy/blob/master/lib/main.js
*/


var http = require('http');
var https = require('https');
var url = require('url');
var querystring = require('querystring');

function proxyHelper(localPort) {
    this.localPort = localPort || 64435;
}



proxyHelper.prototype.solve = function(destinationUrl) {
    var destination = url.parse(destinationUrl);
    if (!destination.port) {
        destination.port = destination.protocol === 'https:' ? 443 : 80;
    }

    if (!this.initialized) this.init();

    if (typeof this.tunnelServer === 'undefined') {
        return destinationUrl;   // Direct connection
    }

    var proxyUrl = 
        'http://localhost:' + this.localPort + '/' +
        '?protocol=' + destination.protocol.replace(':', '')  +
        '&hostname=' + destination.hostname +
        '&port=' + destination.port;
    
    console.log('proxied url created : ' + proxyUrl);
    
    return proxyUrl;
};

proxyHelper.prototype.init = function (proxyUrl, proxyPort) {
    this.initialized = true;
    
    if (proxyPort) {
        this.localPort = proxyPort;
    }
    
    if (typeof this.tunnelServer !== 'undefined') {
        this.tunnelServer.close();
        this.tunnelServer = undefined;
        delete this.tunnelServer;
    }

    if (!proxyUrl) {
        if (process.env.http_proxy) {
            proxyUrl = process.env.http_proxy;
        } else {
            this.initialized = false;
            console.log('Direct connection (no proxy defined)');
            return false;
        }
    }

    var proxy = url.parse(proxyUrl, true);

    this.tunnelServer = http.createServer(function (request, response) {
        
        //console.log('Proxy Helper : request comes ' + request.url);
        
        var requestUrl = url.parse(request.url, true);
        var hostname = requestUrl.query.hostname;
        var port = requestUrl.query.port;
        
        var temp = {};
        
        for (var i in requestUrl.query) {
            if (requestUrl.query.hasOwnProperty(i)) {
                temp[i] = requestUrl.query[i];
            }
        }
        delete temp.hostname;
        delete temp.port;
        delete temp.protocol;
        
        //console.log(JSON.stringify(request.headers, null, 4));
        
        var options = {
            hostname: typeof proxy !== 'undefined' ? proxy.hostname : hostname,
            port: typeof proxy !== 'undefined' ? proxy.port : port,
            path: 'http://' + hostname + ':' + port + 
                requestUrl.pathname + '?' + querystring.stringify(temp),
            method: request.method,
            headers: request.headers
        };
        
        
        options['headers']['host'] = hostname + ':' + port;

        //console.log('redirect to' + JSON.stringify(options, null, 4));
        
        var proxy_request = requestUrl.query.protocol === 'http'
            ? http.request(options)
            : https.request(options);

        proxy_request.addListener('response', function (proxy_response) {
            //console.log('proxy rsponesed : ' + proxy_response.statusCode);
            proxy_response.addListener('data', function (chunk) {
                //console.log('proxy returned data');
                response.write(chunk, 'binary'); 
            });
            proxy_response.addListener('end', function () { 
                //console.log('proxy ended');
                response.end(); 
            });
            response.writeHead(proxy_response.statusCode, proxy_response.headers);
        });

        proxy_request.on('error', function(err) {
           console.log('Error: found error in proxy-helper - error is: ' + err);
           console.log(err.stack);
        });

        request.addListener('data', function (chunk) { proxy_request.write(chunk, 'binary'); });
        request.addListener('end', function () { proxy_request.end(); });
    });

    this.tunnelServer.listen(this.localPort);
    console.log('ProxyHelper: [' + proxyUrl + "] is now listening on " + this.localPort);
    return true;
}


module.exports = proxyHelper;