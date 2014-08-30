var config = {
    wsServer : "ws://127.0.0.1:34689",
    proxyPort : 1088,
    
    /*
        default to system proxy, which is ENV variable [http_proxy]
        or set it explicitly by fill in a proxy URL
    */
    httpProxy : false,
    /* for internal use only */
    internalProxyPort : 30020
};

module.exports = config;