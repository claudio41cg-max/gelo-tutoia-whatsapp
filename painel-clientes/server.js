const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "64mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "clients.json");
const EXTERNAL_STATE_FILE = path.join(DATA_DIR, "external-controls.json");
const WUZAPI_HISTORY_FILE = path.join(DATA_DIR, "wuzapi-history.json");
const WUZAPI_URL = (process.env.WUZAPI_URL || "https://wuzapi-test-production.up.railway.app").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.WUZAPI_ADMIN_TOKEN || "";
const SEED_CLIENT_NAME = String(process.env.SEED_CLIENT_NAME || "").trim();
const SEED_CLIENT_BUSINESS_NAME = String(process.env.SEED_CLIENT_BUSINESS_NAME || "").trim();
const SEED_CLIENT_PHONE = String(process.env.SEED_CLIENT_PHONE || "").trim();
const SEED_CLIENT_TOKEN = String(process.env.SEED_CLIENT_TOKEN || "").trim();
const INTERNAL_SALE_SENDERS = String(process.env.INTERNAL_SALE_SENDERS || "").split(",").map(v => v.replace(/\D/g, "")).filter(Boolean);
const LEGACY_SEED_PHONE = "5521991777811";
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")).replace(/\/$/, "");
const AI_AGENT_URL = String(process.env.AI_AGENT_URL || "https://gelo-tutoia-whatsapp.claudio41cg.workers.dev/api/agent/reply");
const AGENT_READ_TOKEN = String(process.env.AGENT_READ_TOKEN || "");
const HELPER_TAFA_PHONE = String(process.env.HELPER_TAFA_PHONE || "").replace(/\D/g, "");
const HELPER_MAIRA_PHONE = String(process.env.HELPER_MAIRA_PHONE || "").replace(/\D/g, "");
const HELPER_TAFA_JID = String(process.env.HELPER_TAFA_JID || "").trim();
const HELPER_MAIRA_JID = String(process.env.HELPER_MAIRA_JID || "").trim();
const GELO_INBOX_URL = String(process.env.GELO_INBOX_URL || "https://gelo-tutoia-whatsapp.claudio41cg.workers.dev/api/inbox");
const SALON_SEED_NAME = String(process.env.SALON_SEED_NAME || "").trim();
const SALON_SEED_BUSINESS_NAME = String(process.env.SALON_SEED_BUSINESS_NAME || "").trim();
const SALON_SEED_PHONE = String(process.env.SALON_SEED_PHONE || "").trim();
const SALON_SEED_ACTIVATE_V1 = String(process.env.SALON_SEED_ACTIVATE_V1 || "").trim().toLowerCase() === "true";

app.get("/api/gelo/inbox-local", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
  try {
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
    const vistos = new Set();
    const mensagens = [];
    for (const m of readWuzapiHistory().filter(isAuthorizedHistoryEntry)) {
      const ts = String(m?.timestamp || "");
      if (localDate(ts) !== hoje) continue;
      const id = String(m?.message_id || "").trim();
      const texto = String(m?.transcricao || m?.texto || "").trim();
      if (!texto) continue;
      const dedupe = id || [ts, texto, m?.sender_jid || "", m?.sender_alt || ""].join("|");
      if (vistos.has(dedupe)) continue;
      vistos.add(dedupe);
      mensagens.push({
        message_id:id,
        timestamp:ts,
        texto,
        sender_jid:String(m?.sender_jid || ""),
        sender_alt:String(m?.sender_alt || ""),
        tipo:String(m?.tipo || "")
      });
    }
    mensagens.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
    return res.json({ ok:true, mensagens:mensagens.slice(-500) });
  } catch (e) {
    console.error("Falha no inbox local do Gelo Tutóia:", e?.message || e);
    return res.status(500).json({ ok:false, error:e?.message || "Falha ao ler histórico local" });
  }
});

app.get("/api/gelo/inbox", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
  try {
    const rr = await fetch(GELO_INBOX_URL + (GELO_INBOX_URL.includes("?") ? "&" : "?") + "ts=" + Date.now(), {
      headers: { Accept: "application/json" }
    });
    const textBody = await rr.text();
    let data = {};
    try { data = JSON.parse(textBody || "{}"); } catch {}
    if (!rr.ok) {
      console.error("Worker inbox falhou:", rr.status, String(textBody || "").slice(0, 1200));
      return res.status(502).json({ ok:false, error:"Worker inbox HTTP " + rr.status, detail:String(textBody || "").slice(0, 600) });
    }
    return res.json({ ok:true, vendas:Array.isArray(data?.vendas) ? data.vendas : [] });
  } catch (e) {
    console.error("Falha no proxy do inbox Gelo Tutóia:", e?.message || e);
    return res.status(502).json({ ok:false, error:e?.message || "Falha ao buscar inbox" });
  }
});

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");
if (!fs.existsSync(EXTERNAL_STATE_FILE)) fs.writeFileSync(EXTERNAL_STATE_FILE, JSON.stringify({ aiEnabled: false, manualMode: true }, null, 2));
if (!fs.existsSync(WUZAPI_HISTORY_FILE)) fs.writeFileSync(WUZAPI_HISTORY_FILE, "[]");

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
    return { aiEnabled: state.aiEnabled === true, manualMode: state.manualMode !== false };
  } catch {
    return { aiEnabled: false, manualMode: true };
  }
}
function writeExternalState(state) {
  const clean = { aiEnabled: state.aiEnabled === true, manualMode: state.manualMode !== false };
  fs.writeFileSync(EXTERNAL_STATE_FILE, JSON.stringify(clean, null, 2));
  return clean;
}
function readWuzapiHistory() {
  try {
    const arr = JSON.parse(fs.readFileSync(WUZAPI_HISTORY_FILE, "utf8") || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function authorizedHistoryPhones() {
  return new Set([
    String(SEED_CLIENT_PHONE || "").replace(/\D/g, ""),
    HELPER_TAFA_PHONE,
    HELPER_MAIRA_PHONE,
    ...INTERNAL_SALE_SENDERS
  ].filter(Boolean));
}
function authorizedHistoryJids() {
  return new Set([
    HELPER_TAFA_JID,
    HELPER_MAIRA_JID
  ].filter(Boolean));
}
function isAuthorizedHistoryEntry(entry) {
  if (!entry || entry.is_group === true || entry.is_from_me === true) return false;
  const phone = String(entry.sender_alt || entry.sender_jid || "")
    .replace(/@.*/, "")
    .replace(/\D/g, "");
  const senderJid = String(entry.sender_jid || "");
  const chatJid = String(entry.chat_jid || "");
  return authorizedHistoryPhones().has(phone) ||
    authorizedHistoryJids().has(senderJid) ||
    authorizedHistoryJids().has(chatJid);
}
function appendWuzapiHistory(entry) {
  if (!isAuthorizedHistoryEntry(entry)) return;
  const id = String(entry?.message_id || "").trim();
  const all = readWuzapiHistory().filter(isAuthorizedHistoryEntry);
  if (id && all.some(x => String(x?.message_id || "") === id)) return;
  all.push(entry);
  const recent = all.slice(-5000);
  fs.writeFileSync(WUZAPI_HISTORY_FILE, JSON.stringify(recent, null, 2));
}

function mergeWuzapiHistory(messageId, patch = {}) {
  const id = String(messageId || "").trim();
  if (!id) return;
  const all = readWuzapiHistory().filter(isAuthorizedHistoryEntry);
  const idx = all.findIndex(x => String(x?.message_id || "") === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch, message_id:id };
  } else {
    const entry = { ...patch, message_id:id };
    if (!isAuthorizedHistoryEntry(entry)) return;
    all.push(entry);
  }
  fs.writeFileSync(WUZAPI_HISTORY_FILE, JSON.stringify(all.slice(-5000), null, 2));
}
function audioMessageFromObject(root) {
  const queue=[root]; let steps=0;
  while(queue.length && steps++<600){
    const x=queue.shift();
    if(!x || typeof x!=="object") continue;
    for(const [k,v] of Object.entries(x)){
      if(/audioMessage/i.test(k) && v && typeof v==="object") return v;
      if(v && typeof v==="object") queue.push(v);
    }
  }
  return null;
}
function rawHistoryObject(m) {
  let raw=m?.data_json ?? m?.datajson ?? m?.raw ?? null;
  if(typeof raw==="string"){ try{ raw=JSON.parse(raw); }catch{ return null; } }
  return raw && typeof raw==="object" ? raw : null;
}
function personPhoneForAudio(person, senderAlt="", senderJid="") {
  const direct=String(senderAlt||senderJid||"").replace(/@.*/,"").replace(/\D/g,"");
  if(direct && authorizedHistoryPhones().has(direct)) return direct;
  const n=String(person||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  if(["tafa","tafarel","luciano","luciano rocha"].includes(n)) return HELPER_TAFA_PHONE;
  if(["maira","flavio","flávio"].includes(n)) return HELPER_MAIRA_PHONE;
  if(["claudio","cláudio","dinho","proprietario","proprietário"].includes(n)) return String(SEED_CLIENT_PHONE||"").replace(/\D/g,"");
  return "";
}
async function downloadWuzAudioBase64(token, audio) {
  if(!audio) return "";
  const out=await wuz("/chat/downloadaudio",{
    method:"POST",
    headers:userHeaders(token,true),
    body:JSON.stringify({
      Url:audio.URL??audio.url??"",
      DirectPath:audio.directPath??audio.DirectPath??"",
      MediaKey:audio.mediaKey??audio.MediaKey??"",
      Mimetype:audio.mimetype??audio.Mimetype??"audio/ogg; codecs=opus",
      FileEncSHA256:audio.fileEncSHA256??audio.FileEncSHA256??"",
      FileSHA256:audio.fileSHA256??audio.FileSHA256??"",
      FileLength:Number(audio.fileLength??audio.FileLength??0)
    })
  });
  let p=out?.data??out?.Data??out;
  if(typeof p==="string"){ try{ p=JSON.parse(p); }catch{} }
  return String(p?.Data??p?.data??"").replace(/^data:[^;]+;base64,/i,"");
}
async function processAuthorizedHistoricalAudio({token,messageId,timestamp,person,senderJid="",senderAlt="",chatJid="",audio}) {
  const id=String(messageId||"").trim();
  if(!id || !audio) return null;
  const saved=readWuzapiHistory().find(x=>String(x?.message_id||"")===id);
  if(String(saved?.transcricao||"").trim()) return {ok:true,transcricao:String(saved.transcricao),cached:true};
  const senderPhone=personPhoneForAudio(person,senderAlt,senderJid);
  if(!senderPhone) return null;
  const base64=await downloadWuzAudioBase64(token,audio);
  if(!base64) return null;
  const relay={
    instanceName:"gelo-tutoia",
    forwardedToGeloTest:true,
    historyReplay:true,
    historyReplayTimestamp:String(timestamp||""),
    forwardedTestSenderPhone:senderPhone,
    base64,
    jsonData:JSON.stringify({
      type:"Message",
      event:{
        Info:{
          Chat:String(chatJid||senderJid||""),
          Sender:String(senderJid||chatJid||""),
          SenderAlt:senderPhone+"@s.whatsapp.net",
          IsFromMe:false,
          IsGroup:false,
          ID:id,
          Type:"media",
          PushName:String(person||"Remetente"),
          Timestamp:String(timestamp||new Date().toISOString())
        },
        Message:{audioMessage:{}}
      }
    })
  };
  const rr=await fetch("https://gelo-tutoia-whatsapp.claudio41cg.workers.dev",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(relay)
  });
  const result=await rr.json().catch(()=>({}));
  const workerErro=String(result?.erro||result?.error||"").trim();
  if(!rr.ok || !result?.ok){
    console.error("Falha no Worker ao transcrever áudio histórico:",id,"HTTP",rr.status,workerErro||"sem detalhe");
    return null;
  }
  const transcricao=String(result?.transcricao||"").trim();
  if(!transcricao){
    console.error("Worker retornou áudio histórico sem transcrição:",id,workerErro||"sem detalhe");
    return null;
  }
  mergeWuzapiHistory(id,{
    timestamp:String(timestamp||""),
    pessoa:String(person||"Remetente"),
    sender_jid:String(senderJid||""),
    sender_alt:senderPhone+"@s.whatsapp.net",
    chat_jid:String(chatJid||""),
    tipo:"audio",
    texto:transcricao,
    transcricao,
    interpretacao:result?.interpretacao||null,
    is_from_me:false,
    is_group:false,
    origem:"wuzapi-history"
  });
  return {ok:true,transcricao,interpretacao:result?.interpretacao||null};
}
async function backfillAuthorizedAudioForDate(targetDate, suppliedToken="") {
  const business=suppliedToken?null:await findExistingBusinessUser();
  const token=String(suppliedToken || business?.token || business?.Token || "").trim();
  if(!token) return {processed:0};
  const people=[
    {nome:"Cláudio",jids:String(SEED_CLIENT_PHONE||"").replace(/\D/g,"")?[String(SEED_CLIENT_PHONE||"").replace(/\D/g,"")+"@s.whatsapp.net"]:[]},
    {nome:"Tafarel",jids:helperJidsByName("Tafarel")},
    {nome:"Maíra",jids:helperJidsByName("Maíra")}
  ];
  const savedById=new Map(readWuzapiHistory().map(x=>[String(x?.message_id||""),x]));
  const jobs=[],seen=new Set();
  for(const p of people){
    for(const jid of p.jids){
      try{
        const h=await wuz("/chat/history?chat_jid="+encodeURIComponent(jid)+"&limit=1000",{headers:userHeaders(token)});
        const arr=Array.isArray(h?.data)?h.data:Array.isArray(h)?h:[];
        for(const m of arr){
          const id=String(m?.message_id||"").trim();
          if(!id||seen.has(id)||localDate(m?.timestamp)!==targetDate||m?.is_from_me===true) continue;
          const type=String(m?.message_type||"").toLowerCase();
          if(type!=="audio"&&type!=="media") continue;
          if(String(savedById.get(id)?.transcricao||"").trim()) continue;
          const raw=rawHistoryObject(m);
          const audio=audioMessageFromObject(raw);
          if(!audio) continue;
          seen.add(id);
          jobs.push({token,messageId:id,timestamp:m?.timestamp,person:p.nome,senderJid:m?.sender_jid||"",senderAlt:m?.sender_alt||"",chatJid:m?.chat_jid||jid,audio});
        }
      }catch(e){
        console.error("Falha ao preparar áudio histórico autorizado:",e?.message||e);
      }
    }
  }
  let processed=0;
  let failed=0;
  for(const job of jobs){
    const done=await processAuthorizedHistoricalAudio(job).catch(e=>{
      console.error("Falha ao processar áudio histórico autorizado:",job?.messageId||"",e?.message||e);
      return null;
    });
    if(done) processed++;
    else failed++;
    await new Promise(r=>setTimeout(r,250));
  }
  return {processed,failed,total:jobs.length};
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
    businessType: c.businessType || "geral",
    aiPrompt: c.aiPrompt || "",
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
  const business = await findExistingBusinessUser();
  const token = String(business?.token || business?.Token || "").trim();
  if (!business || !token) {
    console.log("WhatsApp Business encontrado, mas sem token disponível para integração.");
    return false;
  }
  // O Gelo Tutóia deve receber primeiro no Worker principal.
  // O Worker repassa uma cópia ao painel, evitando que um projeto derrube o outro.
  const webhookURL = "https://gelo-tutoia-whatsapp.claudio41cg.workers.dev";
  await wuz("/webhook", {
    method: "POST",
    headers: userHeaders(token, true),
    body: JSON.stringify({ webhookURL, events: ["Message"] })
  });
  console.log("Webhook do Gelo Tutóia apontado para o Worker principal; painel recebe por repasse.");
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

async function gerarRespostaIA(mensagem, telefone = "", agentConfig = {}) {
  const res = await fetch(AI_AGENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mensagem,
      telefone,
      businessName: String(agentConfig?.businessName || "").trim(),
      businessType: String(agentConfig?.businessType || "geral").trim(),
      prompt: String(agentConfig?.aiPrompt || "").trim()
    })
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
    aiEnabled: false,
    manualMode: true,
    connected: false,
    loggedIn: false,
    token: SEED_CLIENT_TOKEN,
    wuzapiUserId,
    createdAt: new Date().toISOString()
  });
  writeClients(clients);
  console.log("Cliente de teste preparado:", businessName, SEED_CLIENT_PHONE);
}


function salonPromptPadrao(nomeSalao) {
  const nome = String(nomeSalao || "Salão").trim() || "Salão";
  return `Você é a atendente virtual de vendas e agendamentos do ${nome}.

OBJETIVO:
Atender clientes pelo WhatsApp, entender o que desejam, tirar dúvidas, apresentar serviços e conduzir naturalmente até o agendamento.

TOM:
- Português do Brasil.
- Simpática, acolhedora, natural e objetiva.
- Mensagens curtas.
- Uma pergunta de cada vez.
- Não pareça robô.
- Nunca invente preço, horário, serviço ou profissional.

PRIMEIRO CONTATO:
Cumprimente de forma natural e pergunte como pode ajudar.
Exemplo: "Oi 😊 Seja bem-vinda ao ${nome}. Como posso te ajudar hoje?"

SERVIÇOS E PREÇOS:
Use somente os serviços e preços informados pelo salão.
Se o valor depender do tamanho, volume ou condição do cabelo, explique que pode variar e faça as perguntas necessárias.
Nunca invente valor.

AGENDAMENTO:
Antes de confirmar, obtenha nome da cliente, serviço, dia, horário ou período desejado e profissional de preferência, se houver.
Nunca confirme horário sem ter informação de disponibilidade.
Se não houver agenda integrada, diga que a equipe vai confirmar o horário.

VENDA COMPLEMENTAR:
Pode sugerir no máximo um serviço complementar que faça sentido, sem insistência.

QUÍMICAS:
Não garanta resultado. Quando necessário, recomende avaliação presencial.

HORÁRIO INDISPONÍVEL:
Ofereça outro horário, outro dia, outro profissional ou lista de espera.

ATENDIMENTO HUMANO:
Encaminhe para uma pessoa quando houver reclamação, dúvida não cadastrada, situação sensível, orçamento que dependa de avaliação ou quando a cliente pedir.

REGRA PRINCIPAL:
O objetivo é transformar interesse em agendamento de forma natural e sem pressão. Nunca invente informações.`;
}

async function ensureSalonSeedClient() {
  const phone = String(SALON_SEED_PHONE || "").replace(/\D/g, "");
  if (!ADMIN_TOKEN || !phone || !SALON_SEED_NAME || !SALON_SEED_BUSINESS_NAME) return;

  const clients = readClients();
  const existing = clients.find(c => String(c.phone || "").replace(/\D/g, "") === phone);
  if (existing) {
    let changed = false;
    if (!existing.businessType) { existing.businessType = "salao"; changed = true; }
    if (!existing.aiPrompt) { existing.aiPrompt = salonPromptPadrao(SALON_SEED_BUSINESS_NAME); changed = true; }
    // Preserva os controles escolhidos no painel após o primeiro cadastro.
    if (typeof existing.aiEnabled !== "boolean") { existing.aiEnabled = false; changed = true; }
    if (typeof existing.manualMode !== "boolean") { existing.manualMode = true; changed = true; }

    // Ativação única solicitada pelo proprietário. Depois disso, futuras
    // alterações manuais no painel continuam sendo respeitadas.
    if (SALON_SEED_ACTIVATE_V1 && existing.salonAiActivatedV1 !== true) {
      existing.aiEnabled = true;
      existing.manualMode = false;
      existing.salonAiActivatedV1 = true;
      changed = true;
      console.log("IA do salão ativada uma vez:", SALON_SEED_BUSINESS_NAME);
    }

    if (changed) writeClients(clients);
    return;
  }

  const token = crypto.randomBytes(24).toString("hex");
  const created = await wuz("/admin/users", {
    method: "POST",
    headers: adminHeaders(true),
    body: JSON.stringify({
      name: SALON_SEED_BUSINESS_NAME.slice(0, 80),
      token,
      webhook: "",
      events: "Message"
    })
  });

  const client = {
    id: crypto.randomUUID(),
    name: SALON_SEED_NAME,
    phone,
    businessName: SALON_SEED_BUSINESS_NAME,
    businessType: "salao",
    aiPrompt: salonPromptPadrao(SALON_SEED_BUSINESS_NAME),
    aiEnabled: false,
    manualMode: true,
    connected: false,
    loggedIn: false,
    token,
    wuzapiUserId: created?.id || created?.data?.id || null,
    createdAt: new Date().toISOString()
  };

  clients.push(client);
  try {
    await configureClientWebhook(client);
  } catch (e) {
    console.error("Falha ao configurar webhook do salão:", e?.message || e);
  }
  writeClients(clients);
  console.log("Cliente salão preparado:", SALON_SEED_BUSINESS_NAME);
}

function agentAuthorized(req) {
  const h = String(req.headers["x-agent-token"] || "");
  return !!AGENT_READ_TOKEN && h === AGENT_READ_TOKEN;
}
function helperPhoneByName(nome) {
  const n = String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (["tafa","tafarel","luciano","luciano rocha"].includes(n)) return HELPER_TAFA_PHONE;
  if (["maira","maíra","flavio","flávio"].includes(n)) return HELPER_MAIRA_PHONE;
  return "";
}
function helperJidsByName(nome) {
  const n = String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const phone = helperPhoneByName(nome);
  const out = [];
  if (phone) out.push(phone + "@s.whatsapp.net");
  if (["tafa","tafarel","luciano","luciano rocha"].includes(n) && HELPER_TAFA_JID) out.push(HELPER_TAFA_JID);
  if (["maira","maíra","flavio","flávio"].includes(n) && HELPER_MAIRA_JID) out.push(HELPER_MAIRA_JID);
  return [...new Set(out)];
}
function localDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(d);
  const v = Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${v.year}-${v.month}-${v.day}`;
}
function localTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone:"America/Sao_Paulo", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).formatToParts(d);
  const v = Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${v.hour}:${v.minute}:${v.second}`;
}

app.get("/api/agent/historico-dia", async (req, res) => {
  try {
    if (!agentAuthorized(req)) return res.status(401).json({ error: "Não autorizado" });

    const data = String(req.query?.data || "").trim();
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(data)
      ? data
      : new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());

    const normalizarHora = (v, fallback) => {
      const s=String(v||"").trim();
      const m=s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if(!m) return fallback;
      const h=Math.max(0,Math.min(23,Number(m[1]))),min=Math.max(0,Math.min(59,Number(m[2]))),sec=Math.max(0,Math.min(59,Number(m[3]||0)));
      return String(h).padStart(2,"0")+":"+String(min).padStart(2,"0")+":"+String(sec).padStart(2,"0");
    };
    const inicio=normalizarHora(req.query?.inicio||req.query?.hora_inicio,"00:00:00");
    const fim=normalizarHora(req.query?.fim||req.query?.hora_fim,"23:59:59");
    const dentroDaFaixa = iso => {
      const h=localTime(iso);
      return !!h && h>=inicio && h<=fim;
    };

    const business = await findExistingBusinessUser();
    const token = String(business?.token || business?.Token || "").trim();
    if (!token) return res.status(503).json({ error: "WhatsApp principal sem acesso ao histórico" });

    try {
      await Promise.race([
        backfillAuthorizedAudioForDate(targetDate, token),
        new Promise(resolve=>setTimeout(resolve, 25000))
      ]);
    } catch (e) {
      console.error("Falha no preenchimento de áudios do histórico:", e?.message || e);
    }

    const ownerPhone = String(SEED_CLIENT_PHONE || "").replace(/\D/g, "");

    const pessoas = [
      { nome:"Cláudio", phone:ownerPhone, jids:ownerPhone ? [ownerPhone + "@s.whatsapp.net"] : [] },
      { nome:"Tafarel", phone:HELPER_TAFA_PHONE, jids:helperJidsByName("Tafarel") },
      { nome:"Maíra", phone:HELPER_MAIRA_PHONE, jids:helperJidsByName("Maíra") }
    ].filter(p=>p.phone && p.jids.length);

    const nomePorJid = new Map();
    const nomePorPhone = new Map();

    const normNome=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    function pushNameHistorico(m) {
      let raw = m?.data_json ?? m?.datajson ?? "";
      if (!raw) return "";
      try { if (typeof raw === "string") raw = JSON.parse(raw); } catch { return ""; }
      const fila=[raw];
      let passos=0;
      while(fila.length && passos++<80){
        const x=fila.shift();
        if(!x||typeof x!=="object") continue;
        for(const [k,v] of Object.entries(x)){
          if(/^(pushname|push_name|pushName)$/i.test(k) && typeof v==="string" && v.trim()) return v.trim();
          if(v&&typeof v==="object") fila.push(v);
        }
      }
      return "";
    }
    function pessoaPorPushName(nome){
      const n=normNome(nome);
      if(["claudio","claudio ferreira"].includes(n)) return "Cláudio";
      if(["tafa","tafarel","tafa luciano","luciano","luciano rocha"].includes(n)) return "Tafarel";
      if(["maira","flavio","flavio maira"].includes(n)) return "Maíra";
      return "";
    }
    for (const p of pessoas) {
      for (const jid of p.jids) nomePorJid.set(String(jid), p.nome);
      if (p.phone) {
        nomePorPhone.set(p.phone,p.nome);
        nomePorJid.set(p.phone + "@s.whatsapp.net", p.nome);
      }
    }

    const jids = new Set(pessoas.flatMap(p=>p.jids).filter(Boolean));

    // Descobre os chats do dia, mas só aceita mensagens cujo remetente seja autorizado.
    // Isso resolve os JIDs do tipo LID sem trazer conversas pessoais para o GPT.
    try {
      const idxResp = await wuz("/chat/history?chat_jid=index", { headers:userHeaders(token) });
      let payload = idxResp?.data ?? idxResp;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch {}
      }
      const businessId = String(business?.id || business?.ID || business?.user_id || business?.userID || "").trim();
      const chats = businessId && payload && typeof payload === "object" && !Array.isArray(payload)
        ? (Array.isArray(payload[businessId]) ? payload[businessId] : [])
        : [];
      for (const ch of chats.slice(0,250)) {
        const jid=String(ch?.chat_jid||"").trim();
        const last=String(ch?.last_updated||ch?.last_message_time||"");
        if(jid && (!last || localDate(last)>=targetDate)) jids.add(jid);
      }
    } catch (e) {
      console.error("Falha ao descobrir chats autorizados do WuzAPI:", e?.message || e);
    }

    const historico = [];
    const vistos = new Set();

    for (const m of readWuzapiHistory().filter(isAuthorizedHistoryEntry)) {
      if (localDate(m?.timestamp) !== targetDate || !dentroDaFaixa(m?.timestamp)) continue;
      const id = String(m?.message_id || "");
      const phone = String(m?.sender_alt || m?.sender_jid || "").replace(/@.*/, "").replace(/\D/g, "");
      const pessoa = nomePorPhone.get(phone) || nomePorJid.get(String(m?.sender_jid || "")) || String(m?.pessoa || "Remetente");
      const dedupe = id || [pessoa, m?.timestamp || "", m?.tipo || "", m?.texto || ""].join("|");
      if (vistos.has(dedupe)) continue;
      vistos.add(dedupe);
      historico.push({
        pessoa,
        phone,
        message_id:id,
        timestamp:m?.timestamp || "",
        message_type:m?.tipo || "",
        text_content:m?.texto || "",
        media_link:"",
        chat_jid:m?.chat_jid || "",
        sender_jid:m?.sender_jid || ""
      });
    }

    for (const jid of jids) {
      try {
        const h = await wuz("/chat/history?chat_jid=" + encodeURIComponent(jid) + "&limit=1000", { headers:userHeaders(token) });
        const arr = Array.isArray(h?.data) ? h.data : Array.isArray(h) ? h : [];
        for (const m of arr) {
          if (localDate(m?.timestamp) !== targetDate) continue;
          const id = String(m?.message_id || "");
          const senderJid = String(m?.sender_jid || "");
          const phone = senderJid.replace(/@.*/, "").replace(/\D/g, "");
          const pushName = pushNameHistorico(m);
          const pessoaNome = pessoaPorPushName(pushName);
          const autorizado = authorizedHistoryPhones().has(phone) ||
            authorizedHistoryJids().has(senderJid) ||
            authorizedHistoryJids().has(String(m?.chat_jid || jid)) ||
            !!pessoaNome;
          if (!autorizado) continue;
          const pessoa = nomePorPhone.get(phone) || nomePorJid.get(senderJid) || nomePorJid.get(String(m?.chat_jid || jid)) || pessoaNome || "Remetente";
          const dedupe = id || [pessoa, m?.timestamp || "", m?.message_type || "", m?.text_content || ""].join("|");
          if (vistos.has(dedupe)) continue;
          vistos.add(dedupe);
          historico.push({
            pessoa,
            phone,
            message_id:id,
            timestamp:m?.timestamp || "",
            message_type:m?.message_type || "",
            text_content:m?.text_content || "",
            media_link:m?.media_link || "",
            chat_jid:m?.chat_jid || jid,
            sender_jid:senderJid
          });
        }
      } catch (e) {
        if (e?.status !== 501) console.error("Falha ao ler histórico diário", jid, e?.message || e);
      }
    }

    const transcritosPorId=new Map(readWuzapiHistory().map(x=>[String(x?.message_id||""),String(x?.transcricao||x?.texto||"").trim()]));
    for(const m of historico){
      if(!String(m.text_content||"").trim() && transcritosPorId.has(String(m.message_id||""))){
        m.text_content=transcritosPorId.get(String(m.message_id||""))||"";
      }
    }
    historico.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));

    const ids = new Set(historico.map(m=>m.message_id).filter(Boolean));
    const phonesByName = Object.fromEntries([
      ...pessoas.map(p=>[p.nome,p.phone]),
      ...historico.filter(m=>m.phone&&m.pessoa).map(m=>[m.pessoa,m.phone])
    ]);
    const personById = new Map(historico.map(m=>[m.message_id,m.pessoa]).filter(x=>x[0]));

    let inbox = [];
    try {
      const inboxResp = await fetch(GELO_INBOX_URL, { headers:{Accept:"application/json"} });
      const inboxData = await inboxResp.json().catch(()=>({}));
      inbox = inboxResp.ok && Array.isArray(inboxData?.vendas) ? inboxData.vendas : [];
    } catch (e) {
      console.error("Falha ao cruzar inbox no histórico diário:", e?.message || e);
    }

    const vendas = inbox.filter(v => {
      const id = String(v?.remote_key || "").replace(/^mensagem:/, "");
      const remetente = String(v?.remetente || "").replace(/\D/g, "");
      return localDate(v?.recebido_em) === targetDate &&
        dentroDaFaixa(v?.recebido_em) &&
        (ids.has(id) || Object.values(phonesByName).includes(remetente));
    }).map(v => {
      const id = String(v?.remote_key || "").replace(/^mensagem:/, "");
      const remetente = String(v?.remetente || "").replace(/\D/g, "");
      const pessoa = personById.get(id) ||
        Object.entries(phonesByName).find(([,phone])=>phone===remetente)?.[0] || "";
      return {
        pessoa,
        recebido_em:v.recebido_em,
        transcricao:v.transcricao,
        cliente:v.cliente,
        qtd:v.qtd,
        tipo:v.tipo,
        pagamento:v.pagamento,
        confianca:v.confianca,
        remote_key:v.remote_key
      };
    }).sort((a,b)=>String(a.recebido_em).localeCompare(String(b.recebido_em)));

    const pessoasEncontradas = [...new Set(historico.map(m=>m.pessoa).filter(Boolean))];

    res.json({
      ok:true,
      data:targetDate,
      faixa:{inicio,fim},
      pessoas:pessoasEncontradas,
      mensagens_historico:historico.length,
      mensagens:historico.map(m=>({
        pessoa:m.pessoa,
        recebido_em:m.timestamp,
        tipo:m.message_type,
        texto:m.text_content || "",
        tem_midia:!!m.media_link,
        message_id:m.message_id
      })),
      vendas
    });
  } catch (e) {
    console.error("Falha no histórico diário do agente:", e?.message || e);
    res.status(500).json({ error:String(e?.message || e) });
  }
});

app.get("/api/agent/vendas-ajudante", async (req, res) => {
  try {
    if (!agentAuthorized(req)) return res.status(401).json({ error: "Não autorizado" });
    const helper = String(req.query?.helper || "").trim();
    const helperNorm = helper.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    const data = String(req.query?.data || "").trim();
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(data)
      ? data
      : new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());

    const business = await findExistingBusinessUser();
    const token = String(business?.token || business?.Token || "").trim();
    if (!token) return res.status(503).json({ error: "WhatsApp principal sem acesso ao histórico" });

    const ownerRequested = ["claudio","cláudio","dinho","proprietario","proprietário"].includes(helperNorm);
    const businessJid = String(business?.jid || business?.Jid || business?.JID || "").trim();
    const businessPhone = businessJid.replace(/@.*/, "").replace(/\D/g, "");

    const phone = ownerRequested ? businessPhone : helperPhoneByName(helper);
    const jids = ownerRequested
      ? [...new Set([businessJid, businessPhone ? businessPhone + "@s.whatsapp.net" : ""].filter(Boolean))]
      : helperJidsByName(helper);

    if (!phone || !jids.length) return res.status(400).json({ error: "Pessoa inválida para consulta" });

    const historico = [];
    for (const jid of jids) {
      try {
        const h = await wuz("/chat/history?chat_jid=" + encodeURIComponent(jid) + "&limit=1000", { headers:userHeaders(token) });
        const arr = Array.isArray(h?.data) ? h.data : Array.isArray(h) ? h : [];
        for (const m of arr) {
          if (localDate(m?.timestamp) !== targetDate) continue;
          historico.push({
            message_id:String(m?.message_id || ""),
            timestamp:m?.timestamp || "",
            message_type:m?.message_type || "",
            text_content:m?.text_content || "",
            media_link:m?.media_link || "",
            chat_jid:m?.chat_jid || jid,
            sender_jid:m?.sender_jid || ""
          });
        }
      } catch (e) {
        if (e?.status !== 501) console.error("Falha ao ler histórico", jid, e?.message || e);
      }
    }

    const ids = new Set(historico.map(m=>m.message_id).filter(Boolean));
    const inboxResp = await fetch(GELO_INBOX_URL, { headers:{Accept:"application/json"} });
    const inboxData = await inboxResp.json().catch(()=>({}));
    const inbox = inboxResp.ok && Array.isArray(inboxData?.vendas) ? inboxData.vendas : [];

    const vendas = inbox.filter(v => {
      const id = String(v?.remote_key || "").replace(/^mensagem:/, "");
      const remetente = String(v?.remetente || "").replace(/\D/g, "");
      return localDate(v?.recebido_em) === targetDate && (ids.has(id) || remetente === phone);
    }).map(v => ({
      recebido_em:v.recebido_em,
      transcricao:v.transcricao,
      cliente:v.cliente,
      qtd:v.qtd,
      tipo:v.tipo,
      pagamento:v.pagamento,
      confianca:v.confianca,
      remote_key:v.remote_key
    })).sort((a,b)=>String(a.recebido_em).localeCompare(String(b.recebido_em)));

    const mensagensSemVenda = historico
      .filter(m=>!inbox.some(v=>String(v?.remote_key||"").replace(/^mensagem:/,"")===m.message_id))
      .map(m=>({recebido_em:m.timestamp,tipo:m.message_type,texto:m.text_content||"",message_id:m.message_id}));

    res.json({
      ok:true,
      helper,
      data:targetDate,
      total:vendas.length,
      vendas,
      mensagens_historico:historico.length,
      mensagens_sem_venda:mensagensSemVenda
    });
  } catch (e) {
    console.error("Falha no agente de vendas do ajudante:", e?.message || e);
    res.status(500).json({ error:String(e?.message || e) });
  }
});

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
    const businessType = String(req.body?.businessType || "geral").trim().toLowerCase();
    const aiPrompt = String(req.body?.aiPrompt || "").trim().slice(0, 20000);
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
      id, name, phone, businessName, businessType, aiPrompt,
      aiEnabled: false,
      manualMode: true,
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

    appendWuzapiHistory({
      message_id:String(info?.ID || info?.Id || info?.id || ""),
      timestamp:String(info?.Timestamp || new Date().toISOString()),
      pessoa:String(info?.PushName || "").trim() || "Remetente",
      sender_jid:String(info?.Sender || ""),
      sender_alt:String(info?.SenderAlt || ""),
      chat_jid:String(info?.Chat || ""),
      tipo:String(info?.Type || ""),
      texto:String(text || ""),
      transcricao:String(text || ""),
      is_from_me:info?.IsFromMe === true,
      is_group:info?.IsGroup === true,
      origem:"wuzapi"
    });

    const isIncoming = info?.IsFromMe === false;
    const isPrivateChat = info?.IsGroup === false;
    const senderPhone = String(info?.SenderAlt || "")
      .replace("@s.whatsapp.net", "")
      .replace(/\D/g, "");

    console.log("Webhook recebido: Gelo Tutóia (TIM)", senderPhone || info?.Sender || "", String(text || "").slice(0, 160));

    const state = readExternalState();
    const seedPhoneDigits = String(SEED_CLIENT_PHONE || "").replace(/\D/g, "");
    const internalSaleSender = !!senderPhone && (senderPhone === seedPhoneDigits || INTERNAL_SALE_SENDERS.includes(senderPhone));
    if (internalSaleSender) {
      console.log("Mensagem interna/de teste: não responder com agente de clientes.", senderPhone);
      const audio=audioMessageFromObject(msg);
      const messageId=String(info?.ID||info?.Id||info?.id||"").trim();
      if(isIncoming && isPrivateChat && audio && messageId){
        processAuthorizedHistoricalAudio({
          token,
          messageId,
          timestamp:String(info?.Timestamp||new Date().toISOString()),
          person:String(info?.PushName||"Remetente"),
          senderJid:String(info?.Sender||""),
          senderAlt:String(info?.SenderAlt||""),
          chatJid:String(info?.Chat||""),
          audio
        }).catch(e=>console.error("Falha ao transcrever áudio interno:",e?.message||e));
      }
    }
    if (state.aiEnabled === true && state.manualMode === false && isIncoming && isPrivateChat && !internalSaleSender && senderPhone && String(text || "").trim()) {
      let body = "";
      try {
        body = await gerarRespostaIA(String(text || "").trim(), senderPhone, c);
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
  const senderPhone = String(info?.SenderAlt || info?.Sender || "")
    .replace(/@.*/, "")
    .replace(/\D/g, "");
  const senderJid = String(info?.Sender || "").trim();
  const senderAltJid = String(info?.SenderAlt || "").trim();
  const chatJid = String(info?.Chat || "").trim();
  const replyTarget =
    /@lid$/i.test(chatJid) ? chatJid :
    /@lid$/i.test(senderJid) ? senderJid :
    /@s\.whatsapp\.net$/i.test(chatJid) ? chatJid :
    /@s\.whatsapp\.net$/i.test(senderJid) ? senderJid :
    /@s\.whatsapp\.net$/i.test(senderAltJid) ? senderAltJid :
    senderPhone;

  // Se esta instância estiver enviando uma mensagem para o WhatsApp principal do Gelo Tutóia
  // (caso de teste Claro -> TIM), encaminha uma cópia ao Worker de vendas.
  try {
    const recipientPhone = String(info?.RecipientAlt || "")
      .replace("@s.whatsapp.net", "")
      .replace(/\D/g, "");
    if (info?.IsFromMe === true && recipientPhone && c?.phone) {
      const business = await findExistingBusinessUser();
      const businessJid = String(business?.jid || business?.Jid || "")
        .replace(/@.*/, "")
        .replace(/\D/g, "");
      if (businessJid && recipientPhone === businessJid) {
        await fetch("https://gelo-tutoia-whatsapp.claudio41cg.workers.dev", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            forwardedToGeloTest: true,
            forwardedTestSenderPhone: String(c.phone || "").replace(/\D/g, "")
          })
        });
        console.log("Teste enviado ao Gelo Tutóia a partir de", c.businessName || c.name);
      }
    }
  } catch (e) {
    console.error("Falha ao encaminhar teste para o Gelo Tutóia:", e?.message || e);
  }

  const clientOwnPhone = String(c?.phone || "").replace(/\D/g, "");
  const isManagedBusinessSender = !!senderPhone && senderPhone === clientOwnPhone;
  if (c.aiEnabled && !c.manualMode && isIncoming && isPrivateChat && !isManagedBusinessSender && senderPhone && String(text || "").trim()) {
    let body = "";
    try {
      body = await gerarRespostaIA(String(text || "").trim(), senderPhone, c);
    } catch (e) {
      console.error("Falha ao gerar resposta IA:", e?.message || e);
      return res.json({ ok: true, autoReply: false, aiError: e?.message || "Falha na IA" });
    }
    try {
      const sent = await wuz("/chat/send/text", {
        method: "POST",
        headers: userHeaders(c.token, true),
        body: JSON.stringify({
          // Usa o JID/LID exato recebido do WhatsApp quando disponível.
          // Isso evita o erro "no LID found" ao tentar reconstruir o destinatário pelo número.
          Phone: replyTarget,
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

app.patch("/api/clients/:id/agent", (req, res) => {
  if (req.params.id === "external-gelo-tutoia") {
    return res.status(400).json({ error: "O agente principal do Gelo Tutóia é gerenciado separadamente." });
  }
  const clients = readClients();
  const c = clients.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: "Cliente não encontrado." });

  if (typeof req.body?.businessType === "string") {
    c.businessType = String(req.body.businessType || "geral").trim().toLowerCase().slice(0, 60) || "geral";
  }
  if (typeof req.body?.aiPrompt === "string") {
    c.aiPrompt = String(req.body.aiPrompt || "").trim().slice(0, 20000);
  }
  if (typeof req.body?.businessName === "string") {
    c.businessName = String(req.body.businessName || "").trim().slice(0, 120);
  }
  writeClients(clients);
  res.json(publicClient(c));
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

async function logTafarelTodayOnce() {
  try {
    const alvo = "2026-09-30";
    const business = await findExistingBusinessUser();
    const token = String(business?.token || business?.Token || "").trim();
    if (!token) {
      console.log("AGENT_TAFA_HISTORY", JSON.stringify({ ok:false, erro:"sem token do WhatsApp principal" }));
      return;
    }

    const jids = helperJidsByName("Tafarel");
    const detalhes = [];
    const ids = new Set();

    for (const jid of jids) {
      try {
        const h = await wuz("/chat/history?chat_jid=" + encodeURIComponent(jid) + "&limit=1000", { headers:userHeaders(token) });
        const arr = Array.isArray(h?.data) ? h.data : Array.isArray(h) ? h : [];
        const doDia = arr.filter(m => localDate(m?.timestamp) === alvo);
        detalhes.push({ jid, total_historico:arr.length, total_no_dia:doDia.length, tipos:doDia.reduce((a,m)=>{const k=String(m?.message_type||"desconhecido");a[k]=(a[k]||0)+1;return a;},{}) });
        for (const m of doDia) if (m?.message_id) ids.add(String(m.message_id));
      } catch (e) {
        detalhes.push({ jid, erro:String(e?.message||e), status:e?.status||null });
      }
    }

    const inboxResp = await fetch(GELO_INBOX_URL, { headers:{Accept:"application/json"} });
    const inboxData = await inboxResp.json().catch(()=>({}));
    const inbox = inboxResp.ok && Array.isArray(inboxData?.vendas) ? inboxData.vendas : [];
    const cruzadas = inbox.filter(v => ids.has(String(v?.remote_key||"").replace(/^mensagem:/,"")));

    console.log("AGENT_TAFA_HISTORY", JSON.stringify({
      ok:true,
      data:alvo,
      jids,
      historico:detalhes,
      ids_no_dia:ids.size,
      inbox_total:inbox.length,
      vendas_cruzadas:cruzadas.length,
      amostra_ids:[...ids].slice(0,12),
      amostra_inbox:inbox.slice(0,8).map(v=>String(v?.remote_key||"").replace(/^mensagem:/,""))
    }));
  } catch (e) {
    console.log("AGENT_TAFA_HISTORY", JSON.stringify({ ok:false, erro:String(e?.message||e) }));
  }
}

async function enableGeloHistoryOnce() {
  try {
    const business = await findExistingBusinessUser();
    const id = String(business?.id || business?.ID || "").trim();
    if (!id) {
      console.log("HISTORY_ENABLE_RESULT", JSON.stringify({ok:false,erro:"gelo-tutoia não encontrado"}));
      return;
    }
    const before = await wuz("/admin/users/" + encodeURIComponent(id), { headers: adminHeaders() });
    const arr = Array.isArray(before?.data) ? before.data : [];
    const current = arr[0] || business || {};
    const previous = Number(current?.history || current?.History || 0);

    await wuz("/admin/users/" + encodeURIComponent(id), {
      method:"PUT",
      headers:adminHeaders(true),
      body:JSON.stringify({history:1000})
    });

    const after = await wuz("/admin/users/" + encodeURIComponent(id), { headers: adminHeaders() });
    const arr2 = Array.isArray(after?.data) ? after.data : [];
    const now = arr2[0] || {};
    console.log("HISTORY_ENABLE_RESULT", JSON.stringify({
      ok:true,
      id,
      nome:now?.name || current?.name || "gelo-tutoia",
      antes:previous,
      depois:Number(now?.history || now?.History || 0),
      connected:!!(now?.connected ?? now?.Connected ?? current?.connected ?? current?.Connected),
      loggedIn:!!(now?.loggedIn ?? now?.LoggedIn ?? current?.loggedIn ?? current?.LoggedIn)
    }));
  } catch (e) {
    console.log("HISTORY_ENABLE_RESULT", JSON.stringify({ok:false,erro:String(e?.message||e),status:e?.status||null}));
  }
}


async function logLucianoWindowTodayOnce() {
  try {
    const business = await findExistingBusinessUser();
    const token = String(business?.token || business?.Token || "").trim();
    if (!token) {
      console.log("LUCIANO_WINDOW_TODAY", JSON.stringify({ok:false,erro:"sem token"}));
      return;
    }
    const jids = helperJidsByName("Tafarel");
    const all = [];
    const seen = new Set();
    for (const jid of jids) {
      try {
        const h = await wuz("/chat/history?chat_jid=" + encodeURIComponent(jid) + "&limit=1000", { headers:userHeaders(token) });
        const arr = Array.isArray(h?.data) ? h.data : Array.isArray(h) ? h : [];
        for (const m of arr) {
          const id = String(m?.message_id || "");
          if (id && seen.has(id)) continue;
          const d = new Date(m?.timestamp);
          if (Number.isNaN(d.getTime())) continue;
          const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
            timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit",
            hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
          }).formatToParts(d).map(x=>[x.type,x.value]));
          const date = `${parts.year}-${parts.month}-${parts.day}`;
          const time = `${parts.hour}:${parts.minute}:${parts.second}`;
          if (date !== "2026-10-01" || time < "08:00:00" || time > "12:00:00") continue;
          if (id) seen.add(id);
          all.push({
            horario: time,
            tipo: String(m?.message_type || ""),
            texto: String(m?.text_content || m?.caption || m?.body || "").trim() || "[áudio/media sem transcrição]"
          });
        }
      } catch (e) {
        console.log("LUCIANO_WINDOW_TODAY_ERROR", String(e?.message||e));
      }
    }
    all.sort((a,b)=>a.horario.localeCompare(b.horario));
    console.log("LUCIANO_WINDOW_TODAY", JSON.stringify({ok:true,mensagens:all}));
  } catch (e) {
    console.log("LUCIANO_WINDOW_TODAY", JSON.stringify({ok:false,erro:String(e?.message||e)}));
  }
}


function deepFindAudioMessage(root) {
  const q=[root]; let steps=0;
  while(q.length && steps++<500){
    const x=q.shift();
    if(!x || typeof x!=="object") continue;
    for(const [k,v] of Object.entries(x)){
      if(/audioMessage/i.test(k) && v && typeof v==="object") return v;
      if(v && typeof v==="object") q.push(v);
    }
  }
  return null;
}
function historyRawObject(m){
  let raw=m?.data_json ?? m?.datajson ?? m?.raw ?? null;
  if(typeof raw==="string"){try{raw=JSON.parse(raw)}catch{return null}}
  return raw && typeof raw==="object" ? raw : null;
}
function spDateTime(iso){
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{
    timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
  }).formatToParts(d).map(x=>[x.type,x.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}:${parts.second}`};
}
async function replayLucianoSalesWindowOnce(){
  try{
    const business=await findExistingBusinessUser();
    const token=String(business?.token||business?.Token||"").trim();
    if(!token){console.log("LUCIANO_REPLAY_SUMMARY",JSON.stringify({ok:false,erro:"sem token"}));return}
    const jids=helperJidsByName("Tafarel");
    const seen=new Set(), audios=[];
    for(const jid of jids){
      let h;
      try{h=await wuz("/chat/history?chat_jid="+encodeURIComponent(jid)+"&limit=1000",{headers:userHeaders(token)})}
      catch(e){continue}
      const arr=Array.isArray(h?.data)?h.data:Array.isArray(h)?h:[];
      for(const m of arr){
        const dt=spDateTime(m?.timestamp); if(!dt)continue;
        if(dt.date!=="2026-10-01"||dt.time<"08:00:00"||dt.time>"12:00:00")continue;
        if(m?.is_from_me===true)continue;
        const id=String(m?.message_id||"").trim(); if(!id||seen.has(id))continue;
        const type=String(m?.message_type||"").toLowerCase();
        if(type!=="audio"&&type!=="media")continue;
        const raw=historyRawObject(m);
        const a=deepFindAudioMessage(raw);
        if(!a)continue;
        seen.add(id);
        audios.push({id,time:dt.time,jid,a,m});
      }
    }
    audios.sort((x,y)=>x.time.localeCompare(y.time));
    const replayed=[];
    for(const item of audios){
      try{
        const a=item.a;
        const dl=await wuz("/chat/downloadaudio",{
          method:"POST",headers:userHeaders(token,true),
          body:JSON.stringify({
            Url:a.URL??a.url??"",
            DirectPath:a.directPath??a.DirectPath??"",
            MediaKey:a.mediaKey??a.MediaKey??"",
            Mimetype:a.mimetype??a.Mimetype??"audio/ogg; codecs=opus",
            FileEncSHA256:a.fileEncSHA256??a.FileEncSHA256??"",
            FileSHA256:a.fileSHA256??a.FileSHA256??"",
            FileLength:Number(a.fileLength??a.FileLength??0)
          })
        });
        let p=dl?.data??dl?.Data??dl;
        if(typeof p==="string"){try{p=JSON.parse(p)}catch{}}
        const dataUrl=String(p?.Data??p?.data??"");
        const base64=dataUrl.replace(/^data:[^;]+;base64,/i,"");
        if(!base64)continue;
        const senderAlt=String(item.m?.sender_alt||item.m?.sender_jid||"");
        const syntheticId="DIAG-"+item.id;
        const payload={
          instanceName:"gelo-tutoia",
          base64,
          jsonData:JSON.stringify({
            type:"Message",
            event:{
              Info:{
                Chat:item.jid,Sender:item.jid,SenderAlt:senderAlt,IsFromMe:false,IsGroup:false,
                ID:syntheticId,Type:"media",PushName:"Luciano Rocha",Timestamp:item.m?.timestamp
              },
              Message:{audioMessage:{}}
            }
          })
        };
        const rr=await fetch("https://gelo-tutoia-whatsapp.claudio41cg.workers.dev",{
          method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
        });
        if(rr.ok)replayed.push({id:syntheticId,time:item.time});
      }catch(e){
        console.log("LUCIANO_REPLAY_ITEM_ERROR",item.time,String(e?.message||e));
      }
    }
    await new Promise(r=>setTimeout(r,1500));
    const inboxResp=await fetch(GELO_INBOX_URL,{headers:{Accept:"application/json"}});
    const inboxData=await inboxResp.json().catch(()=>({}));
    const vendas=Array.isArray(inboxData?.vendas)?inboxData.vendas:[];
    const timeById=new Map(replayed.map(x=>[x.id,x.time]));
    const matched=vendas.filter(v=>{
      const id=String(v?.remote_key||"").replace(/^mensagem:/,"");
      return timeById.has(id);
    });
    const result=matched.map(v=>({
      horario:timeById.get(String(v?.remote_key||"").replace(/^mensagem:/,""))||"",
      cliente:v?.cliente||"",
      qtd:Number(v?.qtd||0),
      tipo:v?.tipo||"",
      pagamento:v?.pagamento||"Não informado",
      transcricao:v?.transcricao||"",
      confianca:v?.confianca||""
    })).sort((a,b)=>a.horario.localeCompare(b.horario));
    const statusUrl=String(GELO_INBOX_URL||"").replace(/\/api\/inbox\/?$/,"/api/inbox/status");
    for(const v of matched){
      try{
        await fetch(statusUrl,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({remote_key:v.remote_key,remote_id:v.remote_id,status:"ignorada_app"})
        });
      }catch{}
    }
    const totals=result.reduce((a,v)=>{
      a.vendas++;
      a.sacos+=v.qtd;
      if(v.tipo==="esc")a.escamas+=v.qtd;
      if(v.tipo==="filt")a.filtrado+=v.qtd;
      return a;
    },{vendas:0,sacos:0,escamas:0,filtrado:0});
    console.log("LUCIANO_REPLAY_SUMMARY",JSON.stringify({ok:true,audios_encontrados:audios.length,reprocessados:replayed.length,vendas:result,totais:totals}));
  }catch(e){
    console.log("LUCIANO_REPLAY_SUMMARY",JSON.stringify({ok:false,erro:String(e?.message||e)}));
  }
}


function logAudioHistoryConfirmation(){
  try{
    const rows=readWuzapiHistory().filter(isAuthorizedHistoryEntry);
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const localTime=iso=>{
      const d=new Date(iso); if(Number.isNaN(d.getTime())) return "";
      const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(d).map(x=>[x.type,x.value]));
      return `${p.hour}:${p.minute}:${p.second}`;
    };
    const audiosToday=rows.filter(r=>localDate(r?.timestamp)===today && /audio|media/i.test(String(r?.tipo||"")));
    const withTranscript=audiosToday.filter(r=>String(r?.transcricao||r?.texto||"").trim());
    const tafa=audiosToday.filter(r=>{
      const n=norm(r?.pessoa);
      const h=localTime(r?.timestamp);
      return (n.includes("luciano")||n.includes("tafa")) && h>="08:00:00" && h<="12:00:00";
    }).map(r=>({
      horario:localTime(r?.timestamp),
      transcricao:String(r?.transcricao||r?.texto||"").trim(),
      interpretacao:r?.interpretacao||null
    }));
    console.log("AUDIO_HISTORY_CONFIRM",JSON.stringify({
      data:today,
      audios_autorizados_hoje:audiosToday.length,
      com_transcricao:withTranscript.length,
      tafarel_08_12:tafa
    }));
  }catch(e){
    console.log("AUDIO_HISTORY_CONFIRM",JSON.stringify({erro:String(e?.message||e)}));
  }
}

async function start() {
  migrateLegacyClaroNumber();
  try { await ensureSeedClient(); }
  catch (e) { console.error("Falha ao preparar cliente inicial:", e?.message || e); }
  try { await ensureSalonSeedClient(); }
  catch (e) { console.error("Falha ao preparar cliente salão:", e?.message || e); }
  try { await configureAllClientWebhooks(); }
  catch (e) { console.error("Falha ao configurar webhooks:", e?.message || e); }
  try { await configureExistingBusinessWebhook(); }
  catch (e) { console.error("Falha ao ligar webhook do WhatsApp Business:", e?.message || e); }
  try { await enableGeloHistoryOnce(); }
  catch (e) { console.error("Falha ao ativar histórico WuzAPI:", e?.message || e); }
  try { await logTafarelTodayOnce(); }
  catch (e) { console.error("Falha na verificação do agente Tafarel:", e?.message || e); }
  app.listen(PORT, "0.0.0.0", () => {
    console.log("Painel WhatsApp clientes iniciado na porta " + PORT);
    const hoje=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    setTimeout(async()=>{
      try{
        const r=await backfillAuthorizedAudioForDate(hoje);
        console.log("AUDIO_BACKFILL_RESULT",JSON.stringify(r));
      }catch(e){
        console.error("Falha no backfill de áudio autorizado:",e?.message||e);
      }finally{
        logAudioHistoryConfirmation();
      }
    },2000);
  });
}

start();
