const { WebSocketServer } = require("ws");
// const WebSocketServer = require("./lib/websocket-server");

const wss = new WebSocketServer({
  port: 8080,
});

wss.on("connection", (ws) => {
  console.log("Connection established");
  ws.on("open", () => {
    console.log("Client connected");
  });

  ws.on("message", (data) => {
    console.log("Received: %s", data);
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
