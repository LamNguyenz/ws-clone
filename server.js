// const { WebSocketServer } = require("ws");
const WebSocketServer = require("./lib/websocket-server");

const PORT = 8080;
const wss = new WebSocketServer(
  {
    port: PORT,
  },
  () => {
    console.log("Server is listening on %s", PORT);
  },
);

wss.on("connection", (ws) => {
  console.log("Connection established");
  console.log(ws);
  // ws.on("open", () => {
  //   console.log("Client connected");
  // });

  // ws.on("message", (data) => {
  //   console.log("Received: %s", data);
  // });

  // ws.on("close", () => {
  //   console.log("Client disconnected");
  // });
});
