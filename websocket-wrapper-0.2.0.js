/** 
* @description MeshCentral2 communication using websocket
* @author Ylian Saint-Hilaire
* @version v0.2.0a
*/

// Construct a MeshCentral2 communication object
var CreateWebSocketWrapper = function (host, port, path, certhash) {
    //console.log('CreateWebSocketWrapper', host, port, path, certhash);
    var obj = {};
    obj.host = host;
    obj.port = port;
    obj.path = path;
    obj.certhash = certhash;
    obj.socket = null;
    obj.socketState = 0;
    obj.net = require('net');
    obj.tls = require('tls');
    obj.crypto = require('crypto');
    obj.constants = require('constants');
    obj.xtlsoptions = null;
    obj.accumulator = "";
    obj.accopcodes = 0;
    obj.acclen = -1;
    obj.accmask = false;
    obj.xtlsCertificate = null;
    obj.xtlsFingerprint = null;

    // Events
    obj.ondata = null;
    obj.onclose = null;
    obj.ontimeout = null;
    obj.onconnect = null;
    obj.on = function (ev, fn) {
        if (ev == 'data') { obj.ondata = fn; }
        if (ev == 'close') { obj.onclose = fn; }
        if (ev == 'error') { }
    }

    // Called to initiate a websocket connection to the server
    obj.connect = function (onconnect) {
        obj.onconnect = onconnect;
        obj.socketState = 1;
        obj.accumulator = "";
        obj.accopcodes = 0;
        obj.acclen = -1;
        obj.accmask = false;
        obj.xtlsFingerprint = null;
        if (obj.certhash == null) {
            //console.log('Connecting to ws://' + obj.host + ':' + obj.port + obj.path);
            obj.socket = new obj.net.Socket();
            obj.socket.setEncoding('binary');
            obj.socket.connect(obj.port, obj.host, _OnSocketConnected);
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
    obj.setEncoding = function(encoding) { }
    obj.setTimeout = function (timeout) { }
    obj.setNoDelay = function (delay) { }
    obj.destroy = function () { _OnSocketClosed(); }
    obj.end = function () { _OnSocketClosed(); }
    obj.write = function (data) { _SendEx(data.toString('binary')); }

    // Called when the socket is connected, we still need to do work to get the websocket connected
    function _OnSocketConnected() {
        if (obj.socket == null) return;
        //console.log('Websocket connected');
        // Check if this is really the MeshServer we want to connect to
        obj.xtlsCertificate = obj.socket.getPeerCertificate();
        obj.xtlsFingerprint = obj.xtlsCertificate.fingerprint.split(':').join('').toLowerCase();
        if (obj.xtlsFingerprint != obj.certhash.split(':').join('').toLowerCase()) { console.error('Hash match fail', obj.xtlsFingerprint, obj.certhash.split(':').join('').toLowerCase()); _OnSocketClosed('HashMatchFail'); return; }

        // Send the websocket switching header
        obj.socket.write(new Buffer('GET ' + obj.path + ' HTTP/1.1\r\nHost: ' + obj.host + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n', 'binary'));
    }

    // Called when socket data is received from the server
    function _OnSocketData(e) {
        //console.log('_OnSocketData', typeof e, e.length);
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
                    //console.log('websocket connected');
                    if (obj.onconnect) { obj.onconnect(); }
                } else {
                    // Fail
                    if (header == null) { _OnSocketClosed('Bad header'); } else { _OnSocketClosed(header._Path); }
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
        //if (op != 1) { return; } // We only process text frames
        if ((op == 1 || op == 2) && (obj.ondata != null) && (data.length > 0)) { obj.ondata(data); } // Pass text & binary
        if (op == 8) { _OnSocketClosed('RemoteClose'); } // Close the websocket
    }

    // Called when the socket is closed
    function _OnSocketClosed(cause) {
        //console.log('Websocket closed: ' + cause);
        if (obj.socketState == 0) return;
        obj.socketState = 0;
        if (obj.onclose != null) { obj.onclose(); }
        if (obj.socket != null) { try { obj.socket.end(); } catch (ex) { } obj.socket = null; }
    }

    // Called to send websocket data to the server
    function _Send(object) {
        if (obj.socketState < 2) { return; }
        var data = new Buffer(JSON.stringify(object), 'binary');
        var header = String.fromCharCode(129); // 129 is default full fragment op code (129 = text, 130 = binary)
        if (data.length < 126) { header += String.fromCharCode(data.length); }
        else if (data.length < 65536) { header += String.fromCharCode(126) + ShortToStr(data.length); }
        else { header += String.fromCharCode(127) + IntToStr(0) + IntToStr(data.length); }
        try { obj.socket.write(new Buffer(header + data, 'binary')); } catch (e) { }
    }

    // Called to send websocket data to the server
    function _SendEx(data) {
        if (obj.socketState < 2) { return; }
        //if (typeof data == 'string') { data = new Buffer(data, 'binary'); }
        var header = String.fromCharCode(130); // 129 is default full fragment op code (129 = text, 130 = binary)
        if (data.length < 126) { header += String.fromCharCode(data.length); }
        else if (data.length < 65536) { header += String.fromCharCode(126) + ShortToStr(data.length); }
        else { header += String.fromCharCode(127) + IntToStr(0) + IntToStr(data.length); }
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

