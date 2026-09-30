const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "24mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "clients.json");
const EXTERNAL_STATE_FILE = path.join(DATA_DIR, "external-controls.json");
const WUZAPI_URL = (process.env.WUZAPI_URL || "https://wuzapi-test-production.up.railway.app").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.WUZAPI_ADMIN_TOKEN || "";
const SEED_CLIENT_NAME = String(process.env.SEED_CLIENT_NAME || "").trim();
const SEED_CLIENT_BUSINESS_NAME = String(process.env.SEED_CLIENT_BUSINESS_NAME || "").trim();
const SEED_CLIENT_PHONE = String(process.env.SEED_CLIENT_PHONE || "").trim();
const SEED_CLIENT_TOKEN = String(process.env.SEED_CLIENT_TOKEN || "").trim();
const LEGACY_SEED_PHONE = "5521991777811";
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")).replace(/\/$/, "");
const AI_AGENT_URL = String(process.env.AI_AGENT_URL || "https://gelo-tutoia-whatsapp.claudio41cg.workers.dev/api/agent/reply");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");
if (!fs.existsSync(EXTERNAL_STATE_FILE)) fs.writeFileSync(EXTERNAL_STATE_FILE, JSON.stringify({ aiEnabled: true, manualMode: false }, null, 2));

function readClients() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]"); }
  catch { return []; }
}
function writeClients(clients) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(clients, null, 2));
}
function readExternalState() {
  try {
    const state = JSON.parse(fs.readFileSync(EXTERNAL_STATE_FILE, "utf8") || "{}");
    return { aiEnabled: state.aiEnabled !== false, manualMode: !!state.manualMode };
  } catch {
    return { aiEnabled: true, manualMode: false };
  }
}
function writeExternalState(state) {
  const clean = { aiEnabled: state.aiEnabled !== false, manualMode: !!state.manualMode };
  fs.writeFileSync(EXTERNAL_STATE_FILE, JSON.stringify(clean, null, 2));
  return clean;
}

function migrateLegacyClaroNumber() {
  if (!SEED_CLIENT_PHONE) return;
  const clients = readClients();
  let changed = false;
  for (const c of clients) {
    if (String(c.phone || "") === LEGACY_SEED_PHONE) {
      c.phone = SEED_CLIENT_PHONE;
      changed = true;
    }
  }
  if (changed) {
    writeClients(clients);
    console.log("Número Claro corrigido para:", SEED_CLIENT_PHONE);
  }
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
    wuzapiUserId: c.wuzapiUserId || null,
    externalManaged: !!c.externalManaged
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

async function findExistingBusinessUser() {
  if (!ADMIN_TOKEN) return null;
  const usersResponse = await wuz("/admin/users", { headers: adminHeaders() });
  const users =
    Array.isArray(usersResponse) ? usersResponse :
    Array.isArray(usersResponse?.data) ? usersResponse.data :
    Array.isArray(usersResponse?.users) ? usersResponse.users :
    Array.isArray(usersResponse?.data?.users) ? usersResponse.data.users :
    [];
  return users.find(u => {
    const name = String(u?.name || u?.Name || u?.instanceName || "").trim().toLowerCase();
    return name === "gelo-tutoia" || name === "gelo tutoia";
  }) || null;
}

async function configureExistingBusinessWebhook() {
  if (!PUBLIC_BASE_URL) return false;
  const business = await findExistingBusinessUser();
  const token = String(business?.token || business?.Token || "").trim();
  if (!business || !token) {
    console.log("WhatsApp Business encontrado, mas sem token disponível para integração do agente.");
    return false;
  }
  const webhookURL = PUBLIC_BASE_URL + "/api/webhooks/wuzapi/external-gelo-tutoia";
  await wuz("/webhook", {
    method: "POST",
    headers: userHeaders(token, true),
    body: JSON.stringify({ webhookURL, events: ["Message"] })
  });
  console.log("Webhook do WhatsApp Business ligado ao agente do painel.");
  return true;
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

function webhookUrlFor(c) {
  const key = String(c?.phone || c?.id || "").replace(/\D/g, "");
  if (!PUBLIC_BASE_URL || !key) return "";
  return `${PUBLIC_BASE_URL}/api/webhooks/wuzapi/${key}`;
}

async function configureClientWebhook(c) {
  if (!c?.token) return false;
  const webhookURL = webhookUrlFor(c);
  if (!webhookURL) return false;
  await wuz("/webhook", {
    method: "POST",
    headers: userHeaders(c.token, true),
    body: JSON.stringify({ webhookURL, events: ["Message"] })
  });
  c.webhookURL = webhookURL;
  return true;
}

async function gerarRespostaIA(mensagem, telefone = "") {
  const res = await fetch(AI_AGENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensagem, telefone })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data?.resposta) {
    throw new Error(data?.erro || ("IA HTTP " + res.status));
  }
  return String(data.resposta).trim();
}

async function configureAllClientWebhooks() {
  const clients = readClients();
  let changed = false;
  for (const c of clients) {
    try {
      if (await configureClientWebhook(c)) changed = true;
    } catch (e) {
      console.error("Falha ao configurar webhook de", c.businessName || c.name || c.id, e?.message || e);
    }
  }
  if (changed) writeClients(clients);
}

async function ensureSeedClient() {
  if (!ADMIN_TOKEN || !SEED_CLIENT_PHONE || !SEED_CLIENT_TOKEN) return;
  const clients = readClients();
  if (clients.some(c => String(c.phone || "") === SEED_CLIENT_PHONE)) return;

  const name = SEED_CLIENT_NAME || "Cliente teste";
  const businessName = SEED_CLIENT_BUSINESS_NAME || name;
  let wuzapiUserId = null;

  try {
    const created = await wuz("/admin/users", {
      method: "POST",
      headers: adminHeaders(true),
      body: JSON.stringify({ name: businessName.slice(0, 80), token: SEED_CLIENT_TOKEN, webhook: "", events: "Message" })
    });
    wuzapiUserId = created?.id || created?.data?.id || null;
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    const duplicate = e?.status === 409 || msg.includes("exist") || msg.includes("duplicate") || msg.includes("token");
    if (!duplicate) {
      console.error("Falha ao preparar cliente de teste no WuzAPI:", e?.message || e);
      return;
    }
  }

  clients.push({
    id: crypto.randomUUID(),
    name,
    phone: SEED_CLIENT_PHONE,
    businessName,
    aiEnabled: true,
    manualMode: false,
    connected: false,
    loggedIn: false,
    token: SEED_CLIENT_TOKEN,
    wuzapiUserId,
    createdAt: new Date().toISOString()
  });
  writeClients(clients);
  console.log("Cliente de teste preparado:", businessName, SEED_CLIENT_PHONE);
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
        c.connected = !!(s?.data?.connected ?? s?.data?.Connected);
        c.loggedIn = !!(s?.data?.loggedIn ?? s?.data?.LoggedIn);
      }
    } catch {}
    refreshed.push(c);
  }
  writeClients(refreshed);
  const result = refreshed.map(publicClient);

  try {
    if (ADMIN_TOKEN) {
      const usersResponse = await wuz("/admin/users", { headers: adminHeaders() });
      const users =
        Array.isArray(usersResponse) ? usersResponse :
        Array.isArray(usersResponse?.data) ? usersResponse.data :
        Array.isArray(usersResponse?.users) ? usersResponse.users :
        Array.isArray(usersResponse?.data?.users) ? usersResponse.data.users :
        [];

      const business = users.find(u => {
        const name = String(u?.name || u?.Name || u?.instanceName || "").trim().toLowerCase();
        return name === "gelo-tutoia" || name === "gelo tutoia";
      });

      if (business) {
        const jid = String(business?.jid || business?.Jid || "");
        const phone = jid.replace(/@.*/, "").replace(/\D/g, "");
        const connected = !!(
          business?.connected ??
          business?.Connected ??
          business?.loggedIn ??
          business?.LoggedIn ??
          jid
        );

        const alreadyListed = result.some(c =>
          (phone && String(c.phone || "").replace(/\D/g, "") === phone) ||
          String(c.businessName || "").toLowerCase().includes("gelo tutóia (tim)")
        );

        if (!alreadyListed) {
          result.unshift({
            id: "external-gelo-tutoia",
            name: "WhatsApp Business",
            phone: phone || "Conectado",
            businessName: "Gelo Tutóia (TIM)",
            aiEnabled: readExternalState().aiEnabled,
            manualMode: readExternalState().manualMode,
            createdAt: null,
            connected,
            loggedIn: connected,
            wuzapiUserId: business?.id || business?.ID || null,
            externalManaged: true
          });
        }
      }
    }
  } catch (e) {
    console.error("Falha ao carregar WhatsApp Business existente:", e?.message || e);
  }

  res.json(result);
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
    try { await configureClientWebhook(client); } catch (e) { console.error("Falha ao configurar webhook do novo cliente:", e?.message || e); }
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
    c.connected = !!(out?.data?.connected ?? out?.data?.Connected);
    c.loggedIn = !!(out?.data?.loggedIn ?? out?.data?.LoggedIn);
    writeClients(clients);
    res.json({ connected: c.connected, loggedIn: c.loggedIn, raw: out });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.payload || null });
  }
});

app.post("/api/webhooks/wuzapi/external-gelo-tutoia", async (req, res) => {
  try {
    const payload = req.body || {};

    try {
      await fetch("https://gelo-tutoia-whatsapp.claudio41cg.workers.dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("Falha ao encaminhar evento TIM para o fluxo antigo:", e?.message || e);
    }

    const business = await findExistingBusinessUser();
    const token = String(business?.token || business?.Token || "").trim();
    if (!business || !token) {
      console.error("WhatsApp Business sem token disponível para responder.");
      return res.json({ ok: true, autoReply: false, missingToken: true });
    }

    let event = payload;
    if (typeof payload.jsonData === "string") {
      try { event = JSON.parse(payload.jsonData); } catch {}
    }

    const info = event?.event?.Info || event?.Info || {};
    const msg = event?.event?.Message || event?.Message || {};
    const text =
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption ||
      msg?.videoMessage?.caption ||
      "";

    const isIncoming = info?.IsFromMe === false;
    const isPrivateChat = info?.IsGroup === false;
    const senderPhone = String(info?.SenderAlt || "")
      .replace("@s.whatsapp.net", "")
      .replace(/\D/g, "");

    console.log("Webhook recebido: Gelo Tutóia (TIM)", senderPhone || info?.Sender || "", String(text || "").slice(0, 160));

    const state = readExternalState();
    if (state.aiEnabled && !state.manualMode && isIncoming && isPrivateChat && senderPhone && String(text || "").trim()) {
      let body = "";
      try {
        body = await gerarRespostaIA(String(text || "").trim(), senderPhone);
      } catch (e) {
        console.error("Falha ao gerar resposta IA no TIM:", e?.message || e);
        return res.json({ ok: true, autoReply: false, aiError: e?.message || "Falha na IA" });
      }

      try {
        const sent = await wuz("/chat/send/text", {
          method: "POST",
          headers: userHeaders(token, true),
          body: JSON.stringify({
            Phone: senderPhone,
            Body: body,
            Id: crypto.randomBytes(16).toString("hex").toUpperCase()
          })
        });
        console.log("Resposta automática enviada: Gelo Tutóia (TIM)", senderPhone);
        return res.json({ ok: true, autoReply: true, sent });
      } catch (e) {
        console.error("Falha ao enviar resposta automática no TIM:", e?.message || e);
        return res.status(500).json({ ok: false, error: e?.message || "Falha ao responder" });
      }
    }

    return res.json({ ok: true, aiEnabled: state.aiEnabled, manualMode: state.manualMode, autoReply: false });
  } catch (e) {
    console.error("Falha no webhook do WhatsApp Business TIM:", e?.message || e);
    return res.status(500).json({ ok: false, error: e?.message || "Falha no webhook TIM" });
  }
});

app.post("/api/webhooks/wuzapi/:id", async (req, res) => {
  const clients = readClients();
  const key = String(req.params.id || "");
  const keyDigits = key.replace(/\D/g, "");
  let c = clients.find(x => x.id === key || String(x.phone || "").replace(/\D/g, "") === keyDigits);

  if (!c) {
    const instanceName = String(req.body?.instanceName || "").trim().toLowerCase();
    if (instanceName) {
      c = clients.find(x => String(x.businessName || x.name || "").trim().toLowerCase() === instanceName);
    }
  }

  if (!c) return res.status(404).json({ error: "Cliente não encontrado." });

  const payload = req.body || {};
  let event = payload;
  if (typeof payload.jsonData === "string") {
    try { event = JSON.parse(payload.jsonData); } catch {}
  }

  const info = event?.event?.Info || event?.Info || {};
  const msg = event?.event?.Message || event?.Message || {};
  const text =
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    "";

  c.lastMessageAt = new Date().toISOString();
  c.lastMessageFrom = info?.SenderAlt || info?.Sender || "";
  c.lastMessagePreview = String(text || info?.Type || "").slice(0, 160);
  writeClients(clients);

  console.log("Webhook recebido:", c.businessName || c.name, c.lastMessageFrom, c.lastMessagePreview);

  const isIncoming = info?.IsFromMe === false;
  const isPrivateChat = info?.IsGroup === false;
  const senderPhone = String(info?.SenderAlt || "")
    .replace("@s.whatsapp.net", "")
    .replace(/\D/g, "");

  const isManagedBusinessSender = senderPhone === "5521981378219";
  if (c.aiEnabled && !c.manualMode && isIncoming && isPrivateChat && !isManagedBusinessSender && senderPhone && String(text || "").trim()) {
    let body = "";
    try {
      body = await gerarRespostaIA(String(text || "").trim(), senderPhone);
    } catch (e) {
      console.error("Falha ao gerar resposta IA:", e?.message || e);
      return res.json({ ok: true, autoReply: false, aiError: e?.message || "Falha na IA" });
    }
    try {
      const sent = await wuz("/chat/send/text", {
        method: "POST",
        headers: userHeaders(c.token, true),
        body: JSON.stringify({
          Phone: senderPhone,
          Body: body,
          Id: crypto.randomBytes(16).toString("hex").toUpperCase()
        })
      });
      console.log("Resposta automática enviada:", c.businessName || c.name, senderPhone);
      return res.json({ ok: true, autoReply: true, sent });
    } catch (e) {
      console.error("Falha ao enviar resposta automática:", e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || "Falha ao responder" });
    }
  }

  res.json({ ok: true, aiEnabled: !!c.aiEnabled, manualMode: !!c.manualMode, autoReply: false });
});

app.patch("/api/clients/:id/controls", (req, res) => {
  if (req.params.id === "external-gelo-tutoia") {
    const state = readExternalState();
    if (typeof req.body?.aiEnabled === "boolean") state.aiEnabled = req.body.aiEnabled;
    if (typeof req.body?.manualMode === "boolean") state.manualMode = req.body.manualMode;
    const saved = writeExternalState(state);
    return res.json({ id: "external-gelo-tutoia", name: "WhatsApp Business", businessName: "Gelo Tutóia (TIM)", aiEnabled: saved.aiEnabled, manualMode: saved.manualMode, connected: true, loggedIn: true, externalManaged: true });
  }
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

async function start() {
  migrateLegacyClaroNumber();
  try { await ensureSeedClient(); }
  catch (e) { console.error("Falha ao preparar cliente inicial:", e?.message || e); }
  try { await configureAllClientWebhooks(); }
  catch (e) { console.error("Falha ao configurar webhooks:", e?.message || e); }
  try { await configureExistingBusinessWebhook(); }
  catch (e) { console.error("Falha ao ligar webhook do WhatsApp Business:", e?.message || e); }
  app.listen(PORT, "0.0.0.0", () => {
    console.log("Painel WhatsApp clientes iniciado na porta " + PORT);
  });
}

start();
