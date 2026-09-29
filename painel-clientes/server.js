const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "clients.json");
const WUZAPI_URL = (process.env.WUZAPI_URL || "https://wuzapi-test-production.up.railway.app").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.WUZAPI_ADMIN_TOKEN || "";

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

function readClients() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]"); }
  catch { return []; }
}
function writeClients(clients) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(clients, null, 2));
}
function publicClient(c) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    businessName: c.businessName || "",
    aiEnabled: !!c.aiEnabled,
    manualMode: !!c.manualMode,
    createdAt: c.createdAt,
    connected: c.connected ?? false,
    loggedIn: c.loggedIn ?? false,
    wuzapiUserId: c.wuzapiUserId || null
  };
}
async function wuz(pathname, options = {}) {
  const res = await fetch(WUZAPI_URL + pathname, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || text || ("HTTP " + res.status));
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}
function userHeaders(token, json = false) {
  const h = { Token: token, Authorization: token };
  if (json) h["Content-Type"] = "application/json";
  return h;
}
function adminHeaders(json = false) {
  const h = { Authorization: ADMIN_TOKEN };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, wuzapiConfigured: !!ADMIN_TOKEN, wuzapiUrl: WUZAPI_URL });
});

app.get("/api/clients", async (req, res) => {
  const clients = readClients();
  const refreshed = [];
  for (const c of clients) {
    try {
      if (c.token) {
        const s = await wuz("/session/status", { headers: userHeaders(c.token) });
        c.connected = !!s?.data?.Connected;
        c.loggedIn = !!s?.data?.LoggedIn;
      }
    } catch {}
    refreshed.push(c);
  }
  writeClients(refreshed);
  res.json(refreshed.map(publicClient));
});

app.post("/api/clients", async (req, res) => {
  try {
    if (!ADMIN_TOKEN) return res.status(500).json({ error: "WUZAPI_ADMIN_TOKEN não configurado no painel." });
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const businessName = String(req.body?.businessName || "").trim();
    if (!name || !phone) return res.status(400).json({ error: "Nome e telefone são obrigatórios." });

    const clients = readClients();
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString("hex");
    const wuzName = (businessName || name).slice(0, 80);

    const created = await wuz("/admin/users", {
      method: "POST",
      headers: adminHeaders(true),
      body: JSON.stringify({ name: wuzName, token, webhook: "", events: "Message" })
    });

    const client = {
      id, name, phone, businessName,
      aiEnabled: false,
      manualMode: false,
      connected: false,
      loggedIn: false,
      token,
      wuzapiUserId: created?.id || created?.data?.id || null,
      createdAt: new Date().toISOString()
    };
    clients.push(client);
    writeClients(clients);
    res.status(201).json(publicClient(client));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.payload || null });
  }
});

app.post("/api/clients/:id/connect", async (req, res) => {
  try {
    const clients = readClients();
    const c = clients.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "Cliente não encontrado." });

    const out = await wuz("/session/connect", {
      method: "POST",
      headers: userHeaders(c.token, true),
      body: JSON.stringify({ Subscribe: ["Message"], Immediate: true })
    });
    c.connected = true;
    writeClients(clients);
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.payload || null });
  }
});

app.get("/api/clients/:id/qr", async (req, res) => {
  try {
    const clients = readClients();
    const c = clients.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "Cliente não encontrado." });
    const out = await wuz("/session/qr", { headers: userHeaders(c.token) });
    res.json({ qr: out?.data?.QRCode || null, raw: out });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.payload || null });
  }
});

app.get("/api/clients/:id/status", async (req, res) => {
  try {
    const clients = readClients();
    const c = clients.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "Cliente não encontrado." });
    const out = await wuz("/session/status", { headers: userHeaders(c.token) });
    c.connected = !!out?.data?.Connected;
    c.loggedIn = !!out?.data?.LoggedIn;
    writeClients(clients);
    res.json({ connected: c.connected, loggedIn: c.loggedIn, raw: out });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.payload || null });
  }
});

app.patch("/api/clients/:id/controls", (req, res) => {
  const clients = readClients();
  const c = clients.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: "Cliente não encontrado." });
  if (typeof req.body?.aiEnabled === "boolean") c.aiEnabled = req.body.aiEnabled;
  if (typeof req.body?.manualMode === "boolean") c.manualMode = req.body.manualMode;
  writeClients(clients);
  res.json(publicClient(c));
});

app.post("/api/clients/:id/disconnect", async (req, res) => {
  try {
    const clients = readClients();
    const c = clients.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "Cliente não encontrado." });
    const out = await wuz("/session/disconnect", { method: "POST", headers: userHeaders(c.token) });
    c.connected = false;
    c.loggedIn = false;
    writeClients(clients);
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.payload || null });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Painel WhatsApp clientes iniciado na porta " + PORT);
});
