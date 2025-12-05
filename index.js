import WebSocket, { WebSocketServer } from "ws";
import http from "http";

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Minecraft WebSocket server running.");
});

const wss = new WebSocketServer({ server });

// BLOCKED commands list
const blocked = [
  "kill",
  "damage",
  "summon warden",
  "summon wither",
  "summon ender_dragon",
  "summon enderdragon",
  "summon ender dragon",
  "stop",
  "structure",
  "tickingarea",
  "tp @e",
  "tp @a",
  "execute @e",
  "setblock bedrock",
  "fill bedrock",
  "setblock barrier",
  "fill barrier"
];

// simple lowercase match check
const isBlocked = (cmd) =>
  blocked.some(bad => cmd.toLowerCase().includes(bad.toLowerCase()));

wss.on("connection", socket => {
  console.log("Minecraft connected");

  // let user know connection works
  socket.send(JSON.stringify({
    header: {
      messagePurpose: "commandRequest",
      requestId: "connected",
      version: 1
    },
    body: {
      origin: { type: "player" },
      commandLine: "say WebSocket connected!"
    }
  }));

  // subscribe to events
  const subscribe = eventName => socket.send(JSON.stringify({
    header: {
      messagePurpose: "subscribe",
      requestId: `${eventName}Sub`,
      version: 1
    },
    body: { eventName }
  }));

  subscribe("PlayerMessage");
  subscribe("PlayerDied");
  subscribe("PlayerJoin");
  subscribe("PlayerLeave");

  socket.on("message", data => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    console.log("Received:", msg);

    const event = msg?.header?.eventName;

    // Handle chat -> commands
    if (event === "PlayerMessage") {
      const text = msg.body?.message ?? "";
      console.log("CHAT:", text);

      // The command prefix
      if (text.startsWith("!cmd ")) {
        const command = text.slice(5).trim();

        if (!command.length) return;

        if (isBlocked(command)) {
          socket.send(JSON.stringify({
            header: { messagePurpose: "commandRequest", requestId: "blocked", version: 1 },
            body: {
              origin: { type: "player" },
              commandLine: `say That command is blocked.`
            }
          }));
          console.log(`BLOCKED: ${command}`);
          return;
        }

        // Run safe command
        socket.send(JSON.stringify({
          header: { messagePurpose: "commandRequest", requestId: "runCmd", version: 1 },
          body: {
            origin: { type: "player" },
            commandLine: command
          }
        }));

        console.log(`EXECUTED: ${command}`);
      }
    }

    // Optional death auto-response
    if (event === "PlayerDied") {
      socket.send(JSON.stringify({
        header: {
          messagePurpose: "commandRequest",
          requestId: "deathmsg",
          version: 1
        },
        body: {
          origin: { type: "player" },
          commandLine: "say oops 💀"
        }
      }));
    }
  });

  socket.on("close", () => console.log("Minecraft disconnected"));
});

server.listen(port, () => console.log("Server running on port", port));
