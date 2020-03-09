<%@ WebHandler Language="C#" Class="ManageabilityCommander.WebRelay" %>

using System;
using System.IO;
using System.Net;
using System.Web;
using System.Linq;
using System.Text;
using System.Threading;
using System.Collections;
using System.Net.Sockets;
using System.Net.Security;
using System.Web.WebSockets;
using System.Net.WebSockets;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;

namespace ManageabilityCommander
{
    /// <summary>
    /// WebSocket to TCP/TLS bridge. This handler accepts a websocket connection and forwards the traffic to TCP/TLS.
    /// </summary>
    public class WebRelay : IHttpHandler
    {
        string host = null;
        int port = 0;
        bool tls = false;
        WebSocket websocket = null;
        TcpClient client = null;
        Stream stream = null;
        byte[] clientReadBuf = new byte[16384];
        bool closing = false;
        object mainlock = new object();

        public bool IsReusable { get { return false; } }
        private void Log(string x) { lock (mainlock) { File.AppendAllText("C:\\temp\\tlog.txt", DateTime.Now.ToString() + " - " + x.Replace('\0', '~') + "\r\n"); } }
        
        public void ProcessRequest(HttpContext context)
        {
            var queryargs = System.Web.HttpUtility.ParseQueryString(context.Request.Url.Query);

            if (!context.IsWebSocketRequest)
            {
                context.Response.StatusCode = 200;
                context.Response.Redirect("default.htm");
                context.Response.End();
                return;
            }

            if (queryargs["host"] == null || queryargs["port"] == null || queryargs["tls"] == null)
            {
                context.Response.StatusCode = 200;
                context.Response.ContentType = "text/plain";
                context.Response.Write("Host, Port and Tls arguments expected.");
                context.Response.End();
                return;
            }

            host = queryargs["host"];
            int.TryParse(queryargs["port"], out port);
            tls = (queryargs["tls"] != null && string.Compare(queryargs["tls"], "1", true) == 0);

            if (port < 1 || port > 65535)
            {
                context.Response.StatusCode = 200;
                context.Response.ContentType = "text/plain";
                context.Response.Write("Invalid port.");
                context.Response.End();
                return;
            }

            try
            {
                context.AcceptWebSocketRequest(ProcessNewWebSocket);
            }
            catch (Exception ex)
            {
                context.Response.StatusCode = 202;
                context.Response.ContentType = "text/plain";
                context.Response.Write("AcceptWebSocketRequest() Error: " + ex.ToString());
                context.Response.End();
            }
        }

        private bool CheckClientCert(object sender, X509Certificate cert, X509Chain chain, SslPolicyErrors errors)
        {
            return true;
        }
        
        private async Task ProcessNewWebSocket(AspNetWebSocketContext context)
        {
            websocket = context.WebSocket;
            client = new TcpClient();
            try { await client.ConnectAsync(host, port); } catch (Exception) { client = null; }

            if (client == null)
            {
                await websocket.CloseAsync(WebSocketCloseStatus.EndpointUnavailable, "Unable to TCP connect to target host:port", CancellationToken.None);
                websocket.Dispose();
                websocket = null;
                return;
            }

            try
            {
                if (tls == false)
                {
                    stream = client.GetStream();
                    stream.BeginRead(clientReadBuf, 0, clientReadBuf.Length, new AsyncCallback(onClientReadData), null);
                }
                else
                {
                    SslStream secureClientStream = new SslStream(client.GetStream(), false, new RemoteCertificateValidationCallback(CheckClientCert), null, EncryptionPolicy.RequireEncryption);
                    stream = secureClientStream;
                    secureClientStream.AuthenticateAsClientAsync(host).Wait();
                    stream.BeginRead(clientReadBuf, 0, clientReadBuf.Length, new AsyncCallback(onClientReadData), null);
                }
            }
            catch (Exception) { closing = true; }

            while (closing == false)
            {
                try
                {
                    ArraySegment<byte> buffer = new ArraySegment<byte>(new byte[16384]);
                    WebSocketReceiveResult result = await websocket.ReceiveAsync(buffer, CancellationToken.None);
                    if (closing == true || websocket.State != WebSocketState.Open) break;
                    stream.WriteAsync(buffer.Array, buffer.Offset, result.Count).Wait();
                }
                catch (Exception) { }
            }

            try
            {
                await websocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Remote TCP connection closed", CancellationToken.None);
                websocket.Dispose();
            }
            catch (Exception) { }

            websocket = null;
            stream = null;

            try { client.Close(); } catch (Exception) { }
            client = null;
        }

        private void onClientReadData(IAsyncResult ar)
        {
            int r = 0;
            try { r = stream.EndRead(ar); } catch (Exception) { }

            try
            {
                if (r == 0)
                {
                    closing = true;
                    try { websocket.Abort(); } catch (Exception) { }
                }
                else
                {
                    websocket.SendAsync(new ArraySegment<byte>(clientReadBuf, 0, r), WebSocketMessageType.Binary, true, CancellationToken.None).Wait();
                    stream.BeginRead(clientReadBuf, 0, clientReadBuf.Length, new AsyncCallback(onClientReadData), null);
                }
            }
            catch (Exception) {
                closing = true;
                try { websocket.Abort(); } catch (Exception) { }
            }
        }
        
    }
}