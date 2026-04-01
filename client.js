const WebSocket = require("./lib/websocket");
// const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:8080/chat");

ws.on("open", () => {
  console.log("Connected");
  // ws.send("Hello, server! - from Client");
});

ws.on("message", (data) => {
  console.log("Data: %s", data);
});

ws.on("close", () => {
  console.log("Disconnected");
});
