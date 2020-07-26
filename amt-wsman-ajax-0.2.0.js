/** 
* @description WSMAN communication using browser AJAX
* @author Ylian Saint-Hilaire
* @version v0.2.0c
*/

// Construct a WSMAN communication object
var CreateWsmanComm = function (url) {
    var obj = {};
    obj.PendingAjax = [];               // List of pending AJAX calls. When one frees up, another will start.
    obj.ActiveAjaxCount = 0;            // Number of currently active AJAX calls
    obj.MaxActiveAjaxCount = 1;         // Maximum number of activate AJAX calls at the same time.
    obj.FailAllError = 0;               // Set this to non-zero to fail all AJAX calls with that error status, 999 causes responses to be silent.
    obj.Url = url;

    // Private method
    //   pri = priority, if set to 1, the call is high priority and put on top of the stack.
    obj.PerformAjax = function (postdata, callback, tag, pri, url, action) {
        if ((obj.ActiveAjaxCount == 0 || ((obj.ActiveAjaxCount < obj.MaxActiveAjaxCount) && (obj.challengeParams != null))) && obj.PendingAjax.length == 0) {
            // There are no pending AJAX calls, perform the call now.
            obj.PerformAjaxEx(postdata, callback, tag, url, action);
        } else {
            // If this is a high priority call, put this call in front of the array, otherwise put it in the back.
            if (pri == 1) { obj.PendingAjax.unshift([postdata, callback, tag, url, action]); } else { obj.PendingAjax.push([postdata, callback, tag, url, action]); }
        }
    }

    // Private method
    obj.PerformNextAjax = function () {
        if (obj.ActiveAjaxCount >= obj.MaxActiveAjaxCount || obj.PendingAjax.length == 0) return;
        var x = obj.PendingAjax.shift();
        obj.PerformAjaxEx(x[0], x[1], x[2], x[3], x[4]);
        obj.PerformNextAjax();
    }

    // Private method
    obj.PerformAjaxEx = function (postdata, callback, tag, url, action) {
        if (obj.FailAllError != 0) { if (obj.FailAllError != 999) { obj.gotNextMessagesError({ status: obj.FailAllError }, 'error', null, [postdata, callback, tag]); } return; }
        // console.log('SEND: ' + postdata); // DEBUG

        // We are in a AJAX browser environment
        obj.ActiveAjaxCount++;
        if (!postdata) { postdata = ''; }
        var xdr = null; // TODO: See if we should re-use this object and if we do, when should we do it.
        try { xdr = new XDomainRequest(); } catch (e) { }
        if (!xdr) xdr = new XMLHttpRequest();
        xdr.open(action ? action : 'POST', url ? url : obj.Url);
        xdr.timeout = 15000;
        xdr.onload = function () { obj.gotNextMessages(xdr.responseText, 'success', xdr, [postdata, callback, tag]); };
        xdr.onerror = function () { obj.gotNextMessagesError(xdr, 'error', null, [postdata, callback, tag]); };
        xdr.ontimeout = function () { obj.gotNextMessagesError(xdr, 'error', null, [postdata, callback, tag]); };
        //xdr.send(postdata); // Works for text only, no binary.

        // Send POST body, this work with binary.
        if (urlvars && urlvars['wsmantrace']) { console.log('WSMAN-SEND(' + postdata.length + '): ' + postdata); }
        var b = new Uint8Array(postdata.length);
        for (var i = 0; i < postdata.length; ++i) { b[i] = postdata.charCodeAt(i); }
        xdr.send(b);

        return xdr;
    }

    // AJAX specific private method
    obj.pendingAjaxCall = [];

    // Private method
    obj.gotNextMessages = function (data, status, request, callArgs) {
        if (urlvars && urlvars['wsmantrace']) { console.log('WSMAN-RECV(' + data.length + '): ' + data); }
        obj.ActiveAjaxCount--;
        if (obj.FailAllError == 999) return;
        // console.log('RECV: ' + data); // DEBUG
        if (obj.FailAllError != 0) { callArgs[1](null, obj.FailAllError, callArgs[2]); return; }
        //if (request.status != 200) { callArgs[1](data, request.status, callArgs[2]); obj.PerformNextAjax(); return; }
        callArgs[1](data, request.status, callArgs[2]);
        obj.PerformNextAjax();
    }

    // Private method
    obj.gotNextMessagesError = function (request, status, errorThrown, callArgs) {
        obj.ActiveAjaxCount--;
        if (obj.FailAllError == 999) return;
        if (obj.FailAllError != 0) { callArgs[1](null, obj.FailAllError, callArgs[2]); return; }
        // if (s != 200) { console.log('ERROR, status=' + status + '\r\n\r\nreq=' + callArgs[0]); } // Debug: Display the request & response if something did not work.
        if (obj.FailAllError != 999) { callArgs[1]({ Header: { HttpError: request.status } }, request.status, callArgs[2]); }
        obj.PerformNextAjax();
    }

    // Cancel all pending queries with given status
    obj.CancelAllQueries = function (s) {
        while (obj.PendingAjax.length > 0) { var x = obj.PendingAjax.shift(); x[1](null, s, x[2]); }
    }

    return obj;
}

