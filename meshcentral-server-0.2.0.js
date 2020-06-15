/** 
* @description MeshCentral2 communication using websocket
* @author Ylian Saint-Hilaire
* @version v0.2.0a
*/

// Construct a MeshCentral2 communication object
var CreateMeshCentralServer = function (host, port, path, username, password, token, certhash) {
    var obj = {};
    obj.host = host;
    obj.port = port;
    obj.path = path;
    obj.username = username;
    obj.password = password;
    obj.token = token;
    obj.certhash = certhash;
    //obj.proxy = proxy;
    //obj.proxyPort = 80;
    obj.socket = null;
    obj.socketState = 0;
    obj.net = require('net');
    obj.tls = require('tls');
    obj.crypto = require('crypto');
    obj.constants = require('constants');
    obj.xtlsoptions = null;
    obj.accumulator = '';
    obj.accopcodes = 0;
    obj.acclen = -1;
    obj.accmask = false;
    obj.meshes = {};
    obj.computerlist = [];
    obj.userinfo = null;
    obj.xtlsCertificate = null;
    obj.xtlsFingerprint = null;
    obj.meshServerConnect = true;

    // Events
    obj.onStateChange = null;
    obj.onNodeChange = null;

    /*
    // Parse the proxy
    if (obj.proxy == '') { proxy = null; }
    if (obj.proxy.indexOf(':') > 0) {
        obj.proxyPort = parseInt(obj.proxy.substring(obj.proxy.indexOf(':') + 1));
        obj.proxy = obj.proxy.substring(0, obj.proxy.indexOf(':'));
        if (isNaN(obj.proxyPort)) { obj.proxy = null; obj.proxyPort = 0; }
    }
    */

    // Called to initiate a websocket connection to the server
    obj.connect = function () {
        obj.socketState = 1;
        if (obj.onStateChange != null) { obj.onStateChange(obj, obj.socketState); }
        obj.accumulator = '';
        obj.accopcodes = 0;
        obj.acclen = -1;
        obj.accmask = false;
        obj.xtlsFingerprint = null;
        if (obj.certhash == null) {
            obj.socket = new obj.net.Socket();
            obj.socket.setEncoding('binary');
            obj.socket.connect(obj.port, obj.host, obj.xxOnSocketConnected);
        } else {
            //console.log('Connecting to wss://' + obj.host + ':' + obj.port + obj.path);
            obj.socket = obj.tls.connect(obj.port, obj.host, { rejectUnauthorized: false }, _OnSocketConnected);
            obj.socket.setEncoding('binary');
        }
        obj.socket.on('data', _OnSocketData);
        obj.socket.on('close', _OnSocketClosed);
        obj.socket.on('error', _OnSocketClosed);
    }

    obj.disconnect = function () { _OnSocketClosed('UserDisconnect'); }
    obj.send = function (obj) { _Send(obj); }

    // Called when the socket is connected, we still need to do work to get the websocket connected
    function _OnSocketConnected() {
        if (obj.socket == null) return;
        // Check if this is really the MeshServer we want to connect to
        obj.xtlsCertificate = obj.socket.getPeerCertificate();
        obj.xtlsFingerprint = obj.xtlsCertificate.fingerprint.split(':').join('').toLowerCase();
        if (obj.xtlsFingerprint != obj.certhash.split(':').join('').toLowerCase()) { _OnSocketClosed('HashMatchFail'); return; }

        // If a authentication token is provided, place it in the login URL
        var urlExtras = '';
        if (obj.token != null) { urlExtras = '&token=' + obj.token; }

        // Send the websocket switching header
        obj.socket.write(new Buffer('GET ' + obj.path + '?user=' + encodeURIComponent(obj.username) + '&pass=' + encodeURIComponent(obj.password) + urlExtras + ' HTTP/1.1\r\nHost: ' + obj.host + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n', 'binary'));
    }

    // Called when socket data is received from the server
    function _OnSocketData(e) {
        obj.accumulator += e;
        if (obj.socketState == 1) {
            // Look for the HTTP header response
            var i = obj.accumulator.indexOf('\r\n\r\n');
            if (i >= 0) {
                var header = parseHttpHeader(obj.accumulator.substring(0, i));
                if ((header != null) && (header._Path == '101')) {
                    // Success
                    obj.accumulator = obj.accumulator.substring(i + 4);
                    obj.socketState = 2;
                    if (obj.onStateChange != null) { obj.onStateChange(obj, obj.socketState); }
                    //console.log('websocket connected');
                } else {
                    // Fail
                    _OnSocketClosed();
                }
            }
        }
        if (obj.socketState >= 2) {
            // Parse WebSocket data
            //console.log('ACC(' + obj.accumulator.length + '):' + obj.accumulator);
            while (_parseWsData() != 0) { }
        }
    };

    // Parses websocket data from a socket connection, returns the number of bytes consumed.
    function _parseWsData() {
        if (obj.acclen == -1) {
            // Look for a websocket header
            if (obj.accumulator.length < 2) return 0;
            var headsize = 2;
            obj.accopcodes = obj.accumulator.charCodeAt(0);
            obj.accmask = ((obj.accumulator.charCodeAt(1) & 0x80) != 0)
            obj.acclen = (obj.accumulator.charCodeAt(1) & 0x7F);
            if (obj.acclen == 126) {
                if (obj.accumulator.length < 4) return 0;
                headsize = 4;
                obj.acclen = ReadShort(obj.accumulator, 2);
            }
            else if (obj.acclen == 127) {
                if (obj.accumulator.length < 10) return 0;
                headsize = 10;
                obj.acclen = ReadInt(obj.accumulator, 6);
            }
            if (obj.accmask == true) {
                // TODO: Do unmasking here.
                headsize += 4;
            }
            //console.log('FIN: ' + ((obj.accopcodes & 0x80) != 0) + ', OP: ' + (obj.accopcodes & 0x0F) + ', LEN: ' + obj.acclen + ', MASK: ' + obj.accmask);
            obj.accumulator = obj.accumulator.substring(headsize);
            return headsize;
        } else {
            // Read the data
            if (obj.accumulator.length < obj.acclen) return 0;
            _OnWebSocketMessage(((obj.accopcodes & 0x80) != 0), (obj.accopcodes & 0x0F), obj.accumulator.substring(0, obj.acclen));
            obj.accumulator = obj.accumulator.substring(obj.acclen);
            var out = obj.acclen;
            obj.acclen = -1;
            return out;
        }
    }

    // Called when the a command is received from the server
    function _OnWebSocketMessage(fin, op, data) {
        //console.log('FIN: ' + fin + ', OP: ' + op + ', LEN: ' + data.length, ': ' + data);
        if (op == 8) { _OnSocketClosed('RemoteDisconnect'); return; } // Close the connection
        if (op != 1) { return; } // We only process text frames

        // Parse the incoming JSON command
        var message = null;
        try { message = JSON.parse(data); } catch (ex) { return; }
        if (message == null) return;

        // Process the command
        switch (message.action) {
            case 'close': {
                _OnSocketClosed(message.cause, message.msg);
                break;
            }
            case 'serverinfo': {
                // We got server information, confirm good login.
                obj.socketState = 3;
                if (obj.onStateChange != null) { obj.onStateChange(obj, obj.socketState); }
                _Send({ 'action': 'meshes' });
                break;
            }
            case 'userinfo': {
                obj.userinfo = message.userinfo;
                break;
            }
            case 'meshes': {
                for (var m in message.meshes) { obj.meshes[message.meshes[m]._id] = message.meshes[m]; }
                _Send({ 'action': 'nodes' });
                break;
            }
            case 'nodes': {
                obj.computerlist.splice(0, obj.computerlist.length); // Clear list
                for (var m in message.nodes) {
                    if (!obj.meshes[m]) { console.log('Invalid mesh (1): ' + m); continue; }
                    for (var n in message.nodes[m]) {
                        // Build the ComputerList
                        var no = message.nodes[m][n];
                        if (no.intelamt) {
                            //console.log(no.intelamt);
                            var pmode = 0;
                            if ((no.intelamt.flags & 4) != 0) { pmode = 1; } // ACM
                            if ((no.intelamt.flags & 2) != 0) { pmode = 2; } // CCM
                            var computer = { checked: false, h: Math.random(), host: no.host, icon: no.icon, name: no.name, pmode: pmode, pstate: no.intelamt.state, tags: obj.meshes[m].name, ver: no.intelamt.ver, tls: no.intelamt.tls, conn: no.conn, _id: message.nodes[m][n]._id };
                            obj.computerlist.push(computer);
                        }
                    }
                }
                // Event node change
                if (obj.onNodeChange != null) { obj.onNodeChange(this); }
                break;
            }
            case 'event': {
                switch (message.event.action) {
                    case 'changenode': {
                        for (var i in obj.computerlist) {
                            if (obj.computerlist[i]._id == message.event.nodeid) {
                                var no = message.event.node;
                                var computer = obj.computerlist[i];
                                computer.host = no.host;
                                computer.icon = no.icon;
                                computer.name = no.name;
                                computer.pstate = no.intelamt.state;
                                computer.pmode = 1; // 1 = ACM, 2 = CCM
                                if (obj.meshes[no.meshid]) { computer.tags = obj.meshes[no.meshid].name; }
                                computer.ver = no.intelamt.ver;
                                computer.tls = no.intelamt.tls;
                                if (obj.onNodeChange != null) { obj.onNodeChange(this, computer); }
                            }
                        }
                        break;
                    }
                    case 'nodeconnect': {
                        for (var i in obj.computerlist) {
                            if (obj.computerlist[i]._id == message.event.nodeid) {
                                var computer = obj.computerlist[i];
                                computer.conn = message.event.conn;
                                if (obj.onNodeChange != null) { obj.onNodeChange(this, computer); }
                            }
                        }
                        break;
                    }
                }
                break;
            }
        }
    }

    // Called when the socket is closed
    function _OnSocketClosed(cause, msg) {
        if (obj.socketState == 0) return;
        obj.socketState = 0;
        if (obj.onStateChange != null) { obj.onStateChange(obj, obj.socketState, cause, msg); }
        if (obj.socket != null) { try { obj.socket.end(); } catch (ex) { } obj.socket = null; }
        obj.meshes = {};
        obj.userinfo = null;
        obj.computerlist = [];
        //console.log('closed');
    }

    // Called to send websocket data to the server
    function _Send(object) {
        if (obj.socketState < 2) { return; }
        var data = new Buffer(JSON.stringify(object), 'binary');
        var header = String.fromCharCode(129); // 129 is default full fragment op code
        if (data.length < 126) { header += String.fromCharCode(data.length); }
        else if (data.length < 65536) { header += String.fromCharCode(126) + ShortToStr(data.length); }
        else { header += String.fromCharCode(127) + ShortToInt(0) + ShortToInt(data.length); }
        try { obj.socket.write(new Buffer(header + data, 'binary')); } catch (e) { }
    }

    // Parse the data and return the decoded HTTP header if present.
    function parseHttpHeader(data) {
        var lines = data.split('\r\n');
        if (lines.length < 1) return null;
        var values = {}, directive = lines[0].split(' ');
        if (directive.length < 3) return null;
        values['_Action'] = directive[0];
        values['_Path'] = directive[1];
        values['_Protocol'] = directive[2];
        for (i in lines) { if (i == 0) continue; var j = lines[i].indexOf(':'); if (j > 0) { values[lines[i].substring(0, j).trim()] = lines[i].substring(j + 1).trim(); } }
        if (values['Content-Length']) { values['Content-Length'] = parseInt(values['Content-Length']); }
        return values;
    }

    return obj;
}

