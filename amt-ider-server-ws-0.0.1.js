/** 
* @description IDER Handling Module
* @author Ylian Saint-Hilaire
* @version v0.0.2
*/

// Construct a Intel AMT Server IDER object
var CreateAmtRemoteServerIder = function () {
    var obj = {};
    obj.protocol = 4; // IDER-Server

    obj.iderStart = 0; // OnReboot = 0, Graceful = 1, Now = 2
    obj.floppy = null;
    obj.cdrom = null;
    obj.state = 0;
    obj.onStateChanged = null;
    obj.m = {
        sectorStats: null,
        onDialogPrompt: null,
        dialogPrompt: function (data) { obj.socket.send(JSON.stringify({ action: 'dialogResponse', args: data })); },
        bytesToAmt: 0,
        bytesFromAmt: 0,
        server: true,
        Stop: function () { obj.Stop(); }
    };

    // Private method
    function debug() { if (urlvars && urlvars['idertrace']) { console.log(...arguments); } }

    // Private method, called by parent when it change state
    obj.xxStateChange = function (newstate) {
        if (obj.state == newstate) return;
        debug('SIDER-StateChange', newstate);
        obj.state = newstate;
        if (obj.onStateChanged != null) { obj.onStateChanged(obj, obj.state); }
    }

    obj.Start = function (host, port, user, pass, tls) {
        debug('SIDER-Start', host, port, user, pass, tls);
        obj.host = host;
        obj.port = port;
        obj.user = user;
        obj.pass = pass;
        obj.connectstate = 0;
        obj.socket = new WebSocket(window.location.protocol.replace('http', 'ws') + '//' + window.location.host + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/webider.ashx?host=' + host + '&port=' + port + '&tls=' + tls + ((user == '*') ? '&serverauth=1' : '') + ((typeof pass === 'undefined') ? ('&serverauth=1&user=' + user) : '') + '&tls1only=' + obj.tlsv1only);
        obj.socket.onopen = obj.xxOnSocketConnected;
        obj.socket.onmessage = obj.xxOnMessage;
        obj.socket.onclose = obj.xxOnSocketClosed;
        obj.xxStateChange(1);
    }

    obj.Stop = function () {
        debug('SIDER-Stop');
        if (obj.socket != null) { obj.socket.close(); obj.socket = null; }
        obj.xxStateChange(0);
    }

    obj.xxOnSocketConnected = function () {
        obj.xxStateChange(2);
        obj.socket.send(JSON.stringify({ action: 'start' }));
    }

    obj.xxOnMessage = function (data) {
        var msg = null;
        try { msg = JSON.parse(data.data); } catch (ex) { }
        if ((msg == null) || (typeof msg.action != 'string')) return;

        switch (msg.action) {
            case 'dialog': {
                if (obj.m.onDialogPrompt != null) { obj.m.onDialogPrompt(obj, msg.args, msg.buttons); }
                break;
            }
            case 'state': {
                if (msg.state == 2) { obj.xxStateChange(3); }
                break;
            }
            case 'stats': {
                obj.m.bytesToAmt = msg.toAmt;
                obj.m.bytesFromAmt = msg.fromAmt;
                if (obj.m.sectorStats) { obj.m.sectorStats(msg.mode, msg.dev, msg.total, msg.start, msg.len); }
                break;
            }
            case 'error': {
                var iderErrorStrings = ['', "Floppy disk image does not exist", "Invalid floppy disk image", "Unable to open floppy disk image", "CDROM disk image does not exist", "Invalid CDROM disk image", "Unable to open CDROM disk image", "Can't perform IDER with no disk images"];
                console.log('IDER Error: ' + iderErrorStrings[msg.code]);
                // TODO: Display dialog box this error.
                break;
            }
            default: {
                console.log('Unknown Server IDER action: ' + msg.action);
                breal;
            }
        }

    }

    obj.xxOnSocketClosed = function () { obj.Stop(); }

    return obj;
}
