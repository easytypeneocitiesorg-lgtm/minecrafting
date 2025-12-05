// Simple client for the control panel
const logEl = document.getElementById("log");
const cmdInput = document.getElementById("cmd");
const sendBtn = document.getElementById("send");
const clearBtn = document.getElementById("clear");

function addLog(text, cls) {
  const el = document.createElement("div");
  el.className = cls ? `item ${cls}` : "item";
  el.textContent = `${new Date().toLocaleTimeString()} — ${text}`;
  logEl.appendChild(el);
  logEl.scrollTop = logEl.scrollHeight;
}

// Pick ws or wss depending on page protocol
const proto = location.protocol === "https:" ? "wss" : "ws";
const url = `${proto}://${location.host}`;
const socket = new WebSocket(url);

socket.addEventListener("open", () => {
  addLog("Connected to server", "info");
  // identify as web control client
  socket.send(JSON.stringify({ type: "hello", name: "control-panel" }));
});

socket.addEventListener("message", (ev) => {
  let data;
  try { data = JSON.parse(ev.data); } catch (e) { addLog("Raw: " + ev.data); return; }

  if (data.type === "log") {
    addLog(data.text, "mc");
    return;
  }
  if (data.type === "mc-event") {
    addLog("MC EVENT: " + JSON.stringify(data.event), "mc");
    return;
  }
  if (data.type === "ok") {
    addLog("OK: " + data.text, "ok");
    return;
  }
  if (data.type === "blocked") {
    addLog("BLOCKED: " + data.text, "blocked");
    return;
  }
  if (data.type === "error") {
    addLog("ERROR: " + data.text, "error");
    return;
  }
  if (data.type === "hello" || data.type === "info") {
    addLog(data.text, "info");
    return;
  }
  addLog("MSG: " + JSON.stringify(data), "info");
});

socket.addEventListener("close", () => addLog("Disconnected from server", "error"));
socket.addEventListener("error", () => addLog("WebSocket error", "error"));

sendBtn.addEventListener("click", () => {
  const cmd = cmdInput.value.trim();
  if (!cmd) return;
  socket.send(JSON.stringify({ type: "runCommand", command: cmd }));
  cmdInput.value = "";
});

clearBtn.addEventListener("click", () => { logEl.innerHTML = ""; });

// Allow pressing Enter to send
cmdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendBtn.click();
  }
});
