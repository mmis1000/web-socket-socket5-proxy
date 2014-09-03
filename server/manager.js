
function Manager () {
    this.sessions = [];
}

Manager.prototype.add = function add(sess) {
    this.sessions.push(sess);
    sess.on('destroy', this.onSessionDestroy.bind(this));
    console.log('listener is now listen to destroy event of ' + sess.sessionId);
};

Manager.prototype.onSessionDestroy = function onSessionDestroy(id) {
    console.log('destroy listener of ' + id + ' is triggered');
    var i;
    for (i = this.sessions.length - 1; i >= 0; i--) {
        if (this.sessions[i].sessionId === id) {
            //this.sessions[i].removeAllListeners();
            this.sessions.splice(i, 1);
        }
    }
}

Manager.prototype.clearUp = function clearUp() {
    var i;
    for (i = this.sessions.length - 1; i >= 0; i--) {
        if (!this.sessions[i].isAlive) {
            console.log('removed unexpected listener' + this.sessions[i].sessionId);
            this.sessions.splice(i, 1);
        }
    }
}

Manager.prototype.getStat = function getStat() {
    this.clearUp();
    var i;
    var stat = {}
    stat.memoryUsage = process.memoryUsage();
    stat.sessions = []
    for (i = 0; i < this.sessions.length; i++) {
        stat.sessions.push({
            id : this.sessions[i].sessionId,
            connections : this.sessions[i].sockets.length,
            lastPing : this.sessions[i].lastPing,
            createTime : this.sessions[i].createTime
        });
    }
    return stat;
};

module.exports = Manager;
