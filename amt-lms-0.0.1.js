/** 
* @description Intel AMT LMS control module - using websocket
* @author Ylian Saint-Hilaire
* @version v0.0.1
*/

// Construct a LMS control object
var CreateLmsControl = function () {
    var obj = {};
    var socket = null;
    obj.State = 0;
    obj.onStateChanged = null;
    obj.onData = null;

    // Private method
    obj.Start = function () {
        socket = new WebSocket(window.location.protocol.replace('http', 'ws') + '//' + window.location.host + '/lms.ashx');
        socket.onopen = _OnSocketConnected;
        socket.onmessage = _OnMessage;
        socket.onclose = obj.Stop;
        _StateChange(1);
    }

    function _OnSocketConnected() {
        _StateChange(2);
    }

    // Setup the file reader
    var fileReader = new FileReader();
    var fileReaderInuse = false, fileReaderAcc = [];
    if (fileReader.readAsBinaryString) {
        // Chrome & Firefox (Draft)
        fileReader.onload = function (e) { _OnSocketData(e.target.result); if (fileReaderAcc.length == 0) { fileReaderInuse = false; } else { fileReader.readAsBinaryString(new Blob([fileReaderAcc.shift()])); } }
    } else if (fileReader.readAsArrayBuffer) {
        // Chrome & Firefox (Spec)
        fileReader.onloadend = function (e) { _OnSocketData(e.target.result); if (fileReaderAcc.length == 0) { fileReaderInuse = false; } else { fileReader.readAsArrayBuffer(fileReaderAcc.shift()); } }
    }

    function _OnMessage(e) {
        if (typeof e.data == 'object') {
            if (fileReaderInuse == true) { fileReaderAcc.push(e.data); return; }
            if (fileReader.readAsBinaryString) {
                // Chrome & Firefox (Draft)
                fileReaderInuse = true;
                fileReader.readAsBinaryString(new Blob([e.data]));
            } else if (fileReader.readAsArrayBuffer) {
                // Chrome & Firefox (Spec)
                fileReaderInuse = true;
                fileReader.readAsArrayBuffer(e.data);
            } else {
                // IE10, readAsBinaryString does not exist, use an alternative.
                var binary = '', bytes = new Uint8Array(e.data), length = bytes.byteLength;
                for (var i = 0; i < length; i++) { binary += String.fromCharCode(bytes[i]); }
                _OnSocketData(binary);
            }
        } else {
            _OnSocketData(e.data);
        }
    };
   
    function _OnSocketData(data) {
        if (!data) return;

        if (typeof data === 'object') {
            // This is an ArrayBuffer, convert it to a string array (used in IE)
            var binary = '';
            var bytes = new Uint8Array(data);
            var length = bytes.byteLength;
            for (var i = 0; i < length; i++) { binary += String.fromCharCode(bytes[i]); }
            data = binary;
        }
        else if (typeof data !== 'string') { return; }

        // Send the data up
        if (obj.onData != null) obj.onData(obj, data);
    }
    
    function _Send(x) {
        if (socket != null && socket.readyState == WebSocket.OPEN) {
            var b = new Uint8Array(x.length);
            for (var i = 0; i < x.length; ++i) { b[i] = x.charCodeAt(i); }
            socket.send(b.buffer);
        }
    }

    obj.SendCmd = function (cmdid, data) {
        if (socket == null || obj.State != 2) return;
        if (!data || data == null) data = '';
        _Send(ShortToStrX(cmdid) + data);
    }

    function _StateChange(newstate) {
        if (obj.State == newstate) return;
        obj.State = newstate;
        if (obj.onStateChanged != null) obj.onStateChanged(obj, obj.State);
    }

    obj.Stop = function () {
        _StateChange(0);
        if (socket != null) { socket.close(); socket = null; }
    }

    return obj;
}