import http from "http";
import fs from "fs";
import path from "path";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 3000;

// BLOCKED commands list: edit this to add/remove blocked phrases
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
const isBlocked = (cmd) =>
  blocked.some(bad => cmd.toLowerCase().includes(bad.toLowerCase()));

// Simple static file server for / -> serves public/index.html and assets
const publicDir = path.join(process.cwd(), "public");
const server = http.createServer((req, res) => {
  let urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(publicDir, decodeURIComponent(urlPath));
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === ".html" ? "text/html" : ext === ".js" ? "application/javascript" : ext === ".css" ? "text/css" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

// WebSocket server bound to same HTTP server (Railway handles TLS; this will support ws + wss)
const wss = new WebSocketServer({ server });

const mcSockets = new Set();    // Minecraft Bedrock connections (the game)
const webSockets = new Set();   // Browser control panels (friends)

// Helper to send JSON safely
const sendJSON = (sock, obj) => {
  try { sock.send(JSON.stringify(obj)); } catch (e) {}
};

// Broadcast log messages to all web clients
const broadcastLog = (msg) => {
  const payload = JSON.stringify({ type: "log", text: msg, time: Date.now() });
  for (const s of webSockets) {
    try { s.send(payload); } catch (e) {}
  }
};

wss.on("connection", (socket, req) => {
  let identifiedAs = null; // "mc" or "web"

  // Wait for first message to identify the client type.
  const onMessage = (raw) => {
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) {
      // non-JSON from clients: ignore
      return;
    }

    // If message looks like Minecraft protocol (has header.messagePurpose or header.eventName)
    if (!identifiedAs) {
      if (parsed?.header && (parsed.header.messagePurpose || parsed.header.eventName)) {
        identifiedAs = "mc";
        mcSockets.add(socket);
        console.log("Identified a Minecraft connection");
        // Keep handling as a Minecraft client
      } else if (parsed?.type) {
        identifiedAs = "web";
        webSockets.add(socket);
        console.log("Identified a web control client");
        // Send current welcome message to the web client
        sendJSON(socket, { type: "hello", text: "Connected to control panel", time: Date.now() });
      } else {
        // Unknown first message; treat as web by default
        identifiedAs = "web";
        webSockets.add(socket);
        sendJSON(socket, { type: "hello", text: "Connected to control panel", time: Date.now() });
      }
    }

    // Handle Minecraft messages
    if (identifiedAs === "mc") {
      // Log the raw event to server console
      console.log("MC ->", parsed);

      // Send useful events to web clients
      // Typical Minecraft message structure: header.eventName or body.eventName
      const eventName = parsed?.header?.eventName || parsed?.body?.eventName || null;

      // Player chat event
      if (eventName === "PlayerMessage" || parsed?.body?.message) {
        const player = parsed?.body?.sender ?? parsed?.body?.name ?? "player";
        const message = parsed?.body?.message ?? JSON.stringify(parsed?.body ?? {});
        broadcastLog(`${player}: ${message}`);
      }

      // Player died
      if (eventName === "PlayerDied") {
        broadcastLog(`⚠️ Player died`);
      }

      // Player join/leave (names vary by server message structure)
      if (eventName === "PlayerJoin") broadcastLog(`➡️ Player joined`);
      if (eventName === "PlayerLeave") broadcastLog(`⬅️ Player left`);

      // Optionally forward entire JSON to web clients for debugging
      const forward = { type: "mc-event", event: parsed, time: Date.now() };
      for (const ws of webSockets) {
        try { ws.send(JSON.stringify(forward)); } catch (e) {}
      }

      return;
    }

    // Handle web control client messages
    if (identifiedAs === "web") {
      // Expected messages from browser:
      // { type: "runCommand", command: "time set day" }
      // { type: "hello", name: "alice" }

      const type = parsed.type;

      if (type === "hello") {
        const name = parsed.name ?? "guest";
        sendJSON(socket, { type: "info", text: `Welcome ${name}` });
        return;
      }

      if (type === "runCommand") {
        const command = (parsed.command || "").trim();
        if (!command) {
          sendJSON(socket, { type: "error", text: "Command empty" });
          return;
        }

        if (isBlocked(command)) {
          sendJSON(socket, { type: "blocked", text: "That command is blocked." });
          broadcastLog(`Blocked command attempt: ${command}`);
          return;
        }

        // Build Minecraft commandRequest JSON and send to all MC sockets
        const cmdPayload = {
          header: { messagePurpose: "commandRequest", requestId: `fromweb-${Date.now()}`, version: 1 },
          body: { origin: { type: "player" }, commandLine: command }
        };

        let sentCount = 0;
        for (const ms of mcSockets) {
          try {
            ms.send(JSON.stringify(cmdPayload));
            sentCount++;
          } catch (e) {}
        }

        const msg = `Executed command (sent to ${sentCount} game connections): ${command}`;
        sendJSON(socket, { type: "ok", text: msg });
        broadcastLog(`CMD: ${command}`);
        return;
      }

      // Unknown web message
      sendJSON(socket, { type: "error", text: "Unknown message type" });
      return;
    }
  };

  socket.on("message", onMessage);

  socket.on("close", () => {
    if (identifiedAs === "mc") {
      mcSockets.delete(socket);
      console.log("Minecraft disconnected");
      broadcastLog("Minecraft disconnected");
    } else if (identifiedAs === "web") {
      webSockets.delete(socket);
      console.log("Web control disconnected");
    }
  });

  socket.on("error", (e) => {
    console.log("Socket error:", e?.message ?? e);
  });
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
