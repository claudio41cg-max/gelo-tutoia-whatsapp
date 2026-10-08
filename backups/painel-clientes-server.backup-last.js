const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { interpretarVendas } = require("./sales-parser.js");

const app = express();
app.use(express.json({ limit: "64mb" }));

app.use("/api/gelo",(req,res,next)=>{
  res.set("Access-Control-Allow-Origin","*");
  res.set("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers","Content-Type");
  res.set("Cache-Control","no-store");
  if(req.method==="OPTIONS")return res.sendStatus(204);
  next();
});
app.use(express.urlencoded({ extended: false, limit: "32kb" }));

const PANEL_SESSION_COOKIE="gelo_panel_session";

function panelCredentials(){
  return {
    user:String(process.env.PANEL_BASIC_USER||"").trim(),
    pass:String(process.env.PANEL_BASIC_PASS||"")
  };
}

function safeTextEqual(a,b){
  const aa=Buffer.from(String(a));
  const bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}

function parseCookies(header=""){
  const out={};
  for(const part of String(header).split(";")){
    const i=part.indexOf("=");
    if(i<0)continue;
    const key=part.slice(0,i).trim();
    const value=part.slice(i+1).trim();
    try{out[key]=decodeURIComponent(value)}catch{out[key]=value}
  }
  return out;
}

function panelSessionToken(){
  const {user,pass}=panelCredentials();
  if(!user||!pass)return "";
  return crypto
    .createHmac("sha256",pass)
    .update("gelo-painel-session:"+user)
    .digest("hex");
}

function panelAuthorized(req){
  const token=parseCookies(req.headers.cookie||"")[PANEL_SESSION_COOKIE]||"";
  const expected=panelSessionToken();
  return Boolean(expected)&&safeTextEqual(token,expected);
}

function panelSessionCookie(){
  return PANEL_SESSION_COOKIE+"="+encodeURIComponent(panelSessionToken())+
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000";
}

function panelLoginPage(message=""){
  const note=message
    ?'<div style="margin:0 0 14px;padding:11px 12px;border-radius:12px;background:#3a1c24;color:#ffb6c1;border:1px solid #69303d">'+message+'</div>'
    :"";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entrar no Painel</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e1117;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:20px}.card{width:min(100%,420px);background:#171c25;border:1px solid #2c3442;border-radius:24px;padding:28px;box-shadow:0 24px 70px #0008}h1{font-size:27px;margin:0 0 8px}p{margin:0 0 22px;color:#aeb8c8}.field{margin:14px 0}.field label{display:block;margin-bottom:7px;color:#d8deea}.field input{width:100%;padding:15px 16px;border-radius:14px;border:1px solid #39465b;background:#0d1420;color:#fff;font-size:17px;outline:none}.field input:focus{border-color:#3b9cff}button{width:100%;margin-top:10px;padding:15px;border:0;border-radius:14px;background:#2586d4;color:#fff;font-size:17px;font-weight:800}.small{font-size:12px;color:#7f8b9f;margin-top:16px;text-align:center}
</style>
</head>
<body>
<form class="card" method="post" action="/__panel/login" autocomplete="on">
<h1>Entrar no Painel</h1>
<p>Entre uma vez. Este aparelho ficará conectado por até 30 dias.</p>
${note}
<div class="field"><label>Usuário</label><input name="username" autocomplete="username" required autofocus></div>
<div class="field"><label>Senha</label><input name="password" type="password" autocomplete="current-password" required></div>
<button type="submit">Entrar</button>
<div class="small">A senha não fica salva no aplicativo.</div>
</form>
</body>
</html>`;
}

app.get("/__panel/login",(req,res)=>{
  res.set("Cache-Control","no-store");
  res.type("html").send(panelLoginPage());
});

app.post("/__panel/login",(req,res)=>{
  const {user,pass}=panelCredentials();
  if(!user||!pass){
    return res.status(503).send("Painel administrativo sem credenciais configuradas.");
  }

  const ok=
    safeTextEqual(req.body?.username||"",user)&&
    safeTextEqual(req.body?.password||"",pass);

  if(!ok){
    res.status(401);
    res.set("Cache-Control","no-store");
    return res.type("html").send(panelLoginPage("Usuário ou senha incorretos."));
  }

  res.set("Set-Cookie",panelSessionCookie());
  res.set("Cache-Control","no-store");
  return res.redirect(303,"/");
});

app.get("/__panel/logout",(req,res)=>{
  res.set(
    "Set-Cookie",
    PANEL_SESSION_COOKIE+"=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
  res.set("Cache-Control","no-store");
  return res.redirect(303,"/__panel/login");
});

function panelSessionAuth(req,res,next){
  const publicPath =
    req.path.startsWith("/api/gelo/") ||
    req.path.startsWith("/api/webhooks/") ||
    req.path.startsWith("/api/agent/") ||
    req.path.startsWith("/api/control-bridge/") ||
    req.path === "/api/assistant/vendas-dia" ||
    req.path === "/api/assistant/vendas-pendentes" ||
    req.path === "/api/health" ||
    req.path === "/__panel/login";

  if(publicPath)return next();
  if(panelAuthorized(req))return next();

  if(req.method==="GET"||req.method==="HEAD"){
    res.set("Cache-Control","no-store");
    return res.redirect(303,"/__panel/login");
  }

  return res.status(401).json({error:"Autenticação necessária."});
}

app.use(panelSessionAuth);
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "clients.json");
const EXTERNAL_STATE_FILE = path.join(DATA_DIR, "external-controls.json");
const WUZAPI_HISTORY_FILE = path.join(DATA_DIR, "wuzapi-history.json");
const SALES_SYNC_STATE_FILE = path.join(DATA_DIR, "sales-sync-state.json");
const SALES_DB_FILE = path.join(DATA_DIR, "sales.sqlite");
let salesDb = null;
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
const SALES_ASSISTANT_TOKEN = String(process.env.SALES_ASSISTANT_TOKEN || "").trim();
const CONTROL_BRIDGE_TOKEN = String(process.env.CONTROL_BRIDGE_TOKEN || "").trim();
const HELPER_TAFA_PHONE = String(process.env.HELPER_TAFA_PHONE || "").replace(/\D/g, "");
const HELPER_MAIRA_PHONE = String(process.env.HELPER_MAIRA_PHONE || "").replace(/\D/g, "");
const HELPER_TAFA_JID = String(process.env.HELPER_TAFA_JID || "").trim();
const HELPER_MAIRA_JID = String(process.env.HELPER_MAIRA_JID || "").trim();
const GELO_INBOX_URL = String(process.env.GELO_INBOX_URL || "https://gelo-tutoia-whatsapp.claudio41cg.workers.dev/api/inbox");
const SALON_SEED_NAME = String(process.env.SALON_SEED_NAME || "").trim();
const SALON_SEED_BUSINESS_NAME = String(process.env.SALON_SEED_BUSINESS_NAME || "").trim();
const SALON_SEED_PHONE = String(process.env.SALON_SEED_PHONE || "").trim();
const SALON_SEED_ACTIVATE_V1 = String(process.env.SALON_SEED_ACTIVATE_V1 || "").trim().toLowerCase() === "true";


app.post("/api/gelo/reset-day", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
  try {
    const now=Date.now();
    const archived=archivePendingSales(now);
    console.log("SALES_QUEUE_RESET", JSON.stringify({archived,at:now}));
    return res.json({ok:true,archived,cutoff:now});
  } catch(e) {
    console.error("Falha ao arquivar fila do dia:",e?.message||e);
    return res.status(500).json({ok:false,error:e?.message||"Falha ao reiniciar movimento"});
  }
});

app.post("/api/gelo/ignore-sale", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
  try {
    const messageId=String(req.body?.message_id||"").trim();
    const remoteId=String(req.body?.remote_id||"").trim();
    if(!messageId&&!remoteId) return res.status(400).json({ok:false,error:"message_id ou remote_id obrigatório"});
    const changed=remoteId
      ? setSaleStatus(remoteId,"deleted")
      : deleteSalesByMessageId(messageId);
    console.log("SALES_QUEUE_DELETE", JSON.stringify({messageId,remoteId,changed}));
    return res.json({ok:true,changed,message_id:messageId||null,remote_id:remoteId||null});
  } catch(e) {
    console.error("Falha ao excluir venda da fila:",e?.message||e);
    return res.status(500).json({ok:false,error:e?.message||"Falha ao excluir venda"});
  }
});

app.post("/api/gelo/queue/upsert", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
  try{
    const items=Array.isArray(req.body?.items)?req.body.items:[];
    let inserted=0,existing=0;
    for(const item of items){
      const r=upsertPendingSale(item);
      if(r==="inserted") inserted++;
      else if(r==="existing") existing++;
    }
    for(const item of items){
      console.log("SALES_UPSERT_ROW",JSON.stringify({
        remote_id:String(item?.remote_id||""),remote_key:String(item?.remote_key||""),
        message_id:String(item?.message_id||""),recebido_em:String(item?.recebido_em||item?.timestamp||""),
        cliente:String(item?.cliente||item?.client||""),qtd:Number(item?.qtd||item?.qty||0),
        tipo:String(item?.tipo||item?.product_type||""),pagamento:String(item?.pagamento||item?.payment||"Não informado"),
        transcricao:String(item?.transcricao||item?.transcription||""),remetente:String(item?.remetente||item?.sender||"")
      }));
    }
    return res.json({ok:true,inserted,existing,total:items.length});
  }catch(e){
    console.error("Falha ao gravar fila de vendas:",e?.message||e);
    return res.status(500).json({ok:false,error:e?.message||"Falha ao gravar fila"});
  }
});

app.post("/api/gelo/queue/status", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
  try{
    const remoteId=String(req.body?.remote_id||"").trim();
    const status=String(req.body?.status||"").trim().toLowerCase();
    if(!remoteId) return res.status(400).json({ok:false,error:"remote_id obrigatório"});
    if(!["pending","launched","deleted","archived"].includes(status)) return res.status(400).json({ok:false,error:"status inválido"});
    const changed=setSaleStatus(remoteId,status);
    return res.json({ok:true,changed,remote_id:remoteId,status});
  }catch(e){
    return res.status(500).json({ok:false,error:e?.message||"Falha ao atualizar status"});
  }
});

app.get("/api/gelo/queue/stats", (req,res)=>{
  res.set("Access-Control-Allow-Origin","*");
  res.set("Cache-Control","no-store");
  try{return res.json({ok:true,stats:salesQueueStats()})}
  catch(e){return res.status(500).json({ok:false,error:e?.message||"Falha ao consultar fila"})}
});

app.get("/api/gelo/inbox-local", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
  try {
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
    const syncState=readSalesSyncState();
    const serverCutoff=syncState.date===hoje ? Number(syncState.cutoff||0) : 0;
    const clientAfter=Math.max(0, Number(req.query?.after || 0) || 0);
    const afterMs=Math.max(serverCutoff,clientAfter);
    const toMs = v => {
      if (v == null || v === "") return 0;
      if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
      const s=String(v).trim();
      if (/^\d{10}$/.test(s)) return Number(s)*1000;
      if (/^\d{13}$/.test(s)) return Number(s);
      const t=Date.parse(s);
      return Number.isFinite(t)?t:0;
    };
    const ignoredIds=new Set(Array.isArray(syncState.ignored_ids)?syncState.ignored_ids.map(String):[]);
    const vistos = new Set();
    const mensagens = [];
    for (const m of readWuzapiHistory().filter(isAuthorizedHistoryEntry)) {
      const ts = String(m?.timestamp || "");
      const tsMs = toMs(ts);
      if (localDate(ts) !== hoje) continue;
      if (afterMs && (!tsMs || tsMs <= afterMs)) continue;
      const id = String(m?.message_id || "").trim();
      if(id && ignoredIds.has(id)) continue;
      const texto = String(m?.transcricao || m?.texto || "").trim();
      if (!texto) continue;
      const dedupe = id || [ts, texto, m?.sender_jid || "", m?.sender_alt || ""].join("|");
      if (vistos.has(dedupe)) continue;
      vistos.add(dedupe);
      mensagens.push({
        message_id:id,
        timestamp:ts,
        timestamp_ms:tsMs,
        texto,
        sender_jid:String(m?.sender_jid || ""),
        sender_alt:String(m?.sender_alt || ""),
        tipo:String(m?.tipo || "")
      });
    }
    mensagens.sort((a,b)=>(a.timestamp_ms||0)-(b.timestamp_ms||0));
    return res.json({ ok:true, after:afterMs, server_cutoff:serverCutoff, mensagens:mensagens.slice(-500) });
  } catch (e) {
    console.error("Falha no inbox local do Gelo Tutóia:", e?.message || e);
    return res.status(500).json({ ok:false, error:e?.message || "Falha ao ler histórico local" });
  }
});

app.get("/api/gelo/inbox", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
  try {
    const vendas=listPendingSales();
    return res.json({ok:true,vendas,source:"railway-sqlite",atualizado_em:new Date().toISOString()});
  } catch (e) {
    console.error("Falha ao ler fila SQLite do Gelo Tutóia:", e?.message || e);
    return res.status(500).json({ ok:false, error:e?.message || "Falha ao buscar fila de vendas" });
  }
});


function controlBridgeAuthorized(req){
  const provided=String(req.headers["x-control-token"]||"");
  return Boolean(CONTROL_BRIDGE_TOKEN)&&safeTextEqual(provided,CONTROL_BRIDGE_TOKEN);
}
app.use("/api/control-bridge",(req,res,next)=>{
  if(!controlBridgeAuthorized(req))return res.status(401).json({ok:false,error:"Não autorizado"});
  res.set("Cache-Control","no-store");
  next();
});
app.get("/api/control-bridge/sales",(req,res)=>{
  try{return res.json({ok:true,sales:listControlSales()})}
  catch(e){return res.status(500).json({ok:false,error:e?.message||"Falha ao consultar vendas"})}
});
app.post("/api/control-bridge/sales",(req,res)=>{
  try{const id=insertControlSale({...req.body,source:req.body?.source||"standalone-pwa"});return res.json({ok:true,id})}
  catch(e){return res.status(400).json({ok:false,error:e?.message||"Falha ao registrar venda"})}
});
app.delete("/api/control-bridge/sales/:id",(req,res)=>{
  try{const now=Date.now();const r=salesDb.prepare("UPDATE control_sales SET status='deleted',updated_ms=? WHERE id=?").run(now,String(req.params.id));return res.json({ok:true,changed:Number(r.changes||0)})}
  catch(e){return res.status(500).json({ok:false,error:e?.message||"Falha ao excluir venda"})}
});
app.get("/api/control-bridge/expenses",(req,res)=>{
  try{return res.json({ok:true,expenses:listControlExpenses()})}
  catch(e){return res.status(500).json({ok:false,error:e?.message||"Falha ao consultar despesas"})}
});
app.post("/api/control-bridge/expenses",(req,res)=>{
  try{const id=insertControlExpense({...req.body,source:req.body?.source||"standalone-pwa"});return res.json({ok:true,id})}
  catch(e){return res.status(400).json({ok:false,error:e?.message||"Falha ao registrar saída"})}
});
app.delete("/api/control-bridge/expenses/:id",(req,res)=>{
  try{const now=Date.now();const r=salesDb.prepare("UPDATE control_expenses SET status='deleted',updated_ms=? WHERE id=?").run(now,String(req.params.id));return res.json({ok:true,changed:Number(r.changes||0)})}
  catch(e){return res.status(500).json({ok:false,error:e?.message||"Falha ao excluir saída"})}
});

app.get("/api/controle/sales",(req,res)=>{
  res.set("Cache-Control","no-store");
  try{return res.json({ok:true,sales:listControlSales()})}
  catch(e){return res.status(500).json({ok:false,error:e?.message||"Falha ao consultar vendas"})}
});
app.post("/api/controle/sales",(req,res)=>{
  res.set("Cache-Control","no-store");
  try{const id=insertControlSale(req.body||{});return res.json({ok:true,id})}
  catch(e){return res.status(400).json({ok:false,error:e?.message||"Falha ao registrar venda"})}
});
app.delete("/api/controle/sales/:id",(req,res)=>{
  try{const now=Date.now();const r=salesDb.prepare("UPDATE control_sales SET status='deleted',updated_ms=? WHERE id=?").run(now,String(req.params.id));return res.json({ok:true,changed:Number(r.changes||0)})}
  catch(e){return res.status(500).json({ok:false,error:e?.message||"Falha ao excluir venda"})}
});
app.get("/api/controle/expenses",(req,res)=>{
  res.set("Cache-Control","no-store");
  try{return res.json({ok:true,expenses:listControlExpenses()})}
  catch(e){return res.status(500).json({ok:false,error:e?.message||"Falha ao consultar despesas"})}
});
app.post("/api/controle/expenses",(req,res)=>{
  res.set("Cache-Control","no-store");
  try{const id=insertControlExpense(req.body||{});return res.json({ok:true,id})}
  catch(e){return res.status(400).json({ok:false,error:e?.message||"Falha ao registrar saída"})}
});
app.delete("/api/controle/expenses/:id",(req,res)=>{
  try{const now=Date.now();const r=salesDb.prepare("UPDATE control_expenses SET status='deleted',updated_ms=? WHERE id=?").run(now,String(req.params.id));return res.json({ok:true,changed:Number(r.changes||0)})}
  catch(e){return res.status(500).json({ok:false,error:e?.message||"Falha ao excluir saída"})}
});
app.post("/api/agent/controle/sales",(req,res)=>{
  if(!agentAuthorized(req))return res.status(401).json({ok:false,error:"Não autorizado"});
  try{const id=insertControlSale({...req.body,source:"assistant"});return res.json({ok:true,id})}
  catch(e){return res.status(400).json({ok:false,error:e?.message||"Falha ao lançar venda"})}
});

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");
if (!fs.existsSync(EXTERNAL_STATE_FILE)) fs.writeFileSync(EXTERNAL_STATE_FILE, JSON.stringify({ aiEnabled: false, manualMode: true }, null, 2));
if (!fs.existsSync(WUZAPI_HISTORY_FILE)) fs.writeFileSync(WUZAPI_HISTORY_FILE, "[]");
if (!fs.existsSync(SALES_SYNC_STATE_FILE)) fs.writeFileSync(SALES_SYNC_STATE_FILE, JSON.stringify({ date:"", cutoff:0 }, null, 2));
initSalesQueue();
seedControlLedger();
logRecentSalesForAgent(2);
setTimeout(async()=>{
  try{
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const rawToday=readWuzapiHistory().filter(x=>isAuthorizedHistoryEntry(x)&&localDate(x?.timestamp)===today);
    for(const m of rawToday){
      const texto=String(m?.transcricao||m?.texto||"").trim();
      console.log("AUTHORIZED_HISTORY_ROW",JSON.stringify({
        message_id:String(m?.message_id||""),
        timestamp:String(m?.timestamp||""),
        pessoa:String(m?.pessoa||""),
        sender:String(m?.sender_alt||m?.sender_jid||""),
        tipo:String(m?.tipo||""),
        texto
      }));
      if(texto){
        try{
          const r=ingestSaleTextDirect({
            messageId:String(m?.message_id||""),
            text:texto,
            timestamp:String(m?.timestamp||new Date().toISOString()),
            sender:String(m?.sender_alt||m?.sender_jid||""),
            senderName:String(m?.pessoa||"Remetente")
          });
          console.log("AUTHORIZED_HISTORY_REINGEST",JSON.stringify({message_id:String(m?.message_id||""),...r}));
        }catch(e){console.error("Falha ao reprocessar histórico autorizado:",e?.message||e)}
      }
    }
    const recovered=await backfillAuthorizedAudioForDate(today);
    console.log("AUTHORIZED_AUDIO_RECOVERY",JSON.stringify({date:today,...recovered}));
    const forced=await recoverSpecificAuthorizedAudioIds(today,[
      "AC4741B300DB70B2764A5CE1075AFC88",
      "AC3AA902AE86E1677A39DB02126F1390",
      "ACE5BAEA5CA48DF3A93C2834AC160B86"
    ]);
    console.log("AUTHORIZED_AUDIO_FORCE_RECOVERY",JSON.stringify({date:today,...forced}));
  }catch(e){console.error("Falha ao preparar histórico autorizado do dia:",e?.message||e)}
},5000);

function atomicWriteFile(filePath, content){
  const tmp=filePath+".tmp-"+process.pid+"-"+Date.now();
  fs.writeFileSync(tmp,content);
  fs.renameSync(tmp,filePath);
}
function atomicWriteJson(filePath, value){
  atomicWriteFile(filePath,JSON.stringify(value,null,2));
}

function initSalesQueue(){
  salesDb=new DatabaseSync(SALES_DB_FILE);
  salesDb.exec("PRAGMA journal_mode=WAL;");
  salesDb.exec("PRAGMA synchronous=NORMAL;");
  salesDb.exec(`
    CREATE TABLE IF NOT EXISTS sales_queue(
      remote_id TEXT PRIMARY KEY,
      remote_key TEXT,
      message_id TEXT NOT NULL,
      received_ms INTEGER NOT NULL,
      received_at TEXT,
      transcription TEXT,
      client TEXT,
      qty INTEGER,
      product_type TEXT,
      payment TEXT,
      confidence TEXT,
      sender TEXT,
      sender_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_ms INTEGER NOT NULL,
      updated_ms INTEGER NOT NULL,
      launched_ms INTEGER,
      deleted_ms INTEGER,
      archived_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sales_queue_status_received ON sales_queue(status, received_ms);
    CREATE INDEX IF NOT EXISTS idx_sales_queue_message ON sales_queue(message_id);

    CREATE TABLE IF NOT EXISTS control_sales(
      id TEXT PRIMARY KEY,
      message_id TEXT,
      sold_ms INTEGER NOT NULL,
      sold_at TEXT NOT NULL,
      client TEXT NOT NULL,
      qty INTEGER NOT NULL,
      product_type TEXT NOT NULL,
      payment TEXT NOT NULL,
      unit_price REAL NOT NULL,
      total_value REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'active',
      created_ms INTEGER NOT NULL,
      updated_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_control_sales_sold ON control_sales(status,sold_ms);

    CREATE TABLE IF NOT EXISTS control_expenses(
      id TEXT PRIMARY KEY,
      spent_ms INTEGER NOT NULL,
      spent_at TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'active',
      created_ms INTEGER NOT NULL,
      updated_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_control_expenses_spent ON control_expenses(status,spent_ms);
  `);
  console.log("SALES_QUEUE_SQLITE_READY", SALES_DB_FILE);
}

function controlIso(date,time){
  const d=String(date||"").trim();
  const t=String(time||"00:00").trim()||"00:00";
  const ms=Date.parse(d+"T"+t+":00-03:00");
  if(!d||!Number.isFinite(ms))throw new Error("Data ou horário inválido");
  return {ms,iso:new Date(ms).toISOString()};
}
function controlPrice(client,type){
  if(type==="filt")return 13;
  const n=String(client||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/\b(para|tiago|thiago)\b/.test(n))return 6;
  if(/padaria bmg/.test(n)||/chatuba/.test(n))return 8;
  if(/cliente rua/.test(n))return 10;
  return 7;
}
function insertControlSale(input={},forcedId=""){
  if(!salesDb)throw new Error("Banco indisponível");
  const client=String(input.client||input.cliente||"").trim();
  const type=String(input.product_type||input.tipo||"").trim()==="filt"?"filt":"esc";
  const qty=Math.max(1,Number(input.qty||input.qtd||0)||0);
  const payment=["Dinheiro","PIX","Fiado"].includes(String(input.payment||input.pagamento||""))?String(input.payment||input.pagamento):"Dinheiro";
  if(!client||!qty)throw new Error("Cliente e quantidade são obrigatórios");
  let soldMs,soldAt;
  if(input.sold_at){
    soldMs=Date.parse(input.sold_at);soldAt=new Date(soldMs).toISOString();
  }else{
    const d=controlIso(input.date||localDate(new Date().toISOString()),input.time||localTime(new Date().toISOString()).slice(0,5));
    soldMs=d.ms;soldAt=d.iso;
  }
  const unit=Number(input.unit_price);
  const unitPrice=Number.isFinite(unit)&&unit>=0?unit:controlPrice(client,type);
  const total=Number((unitPrice*qty).toFixed(2));
  const now=Date.now(),id=forcedId||String(input.id||"")||("manual:"+crypto.randomUUID());
  salesDb.prepare(`INSERT OR IGNORE INTO control_sales(
    id,message_id,sold_ms,sold_at,client,qty,product_type,payment,unit_price,total_value,source,status,created_ms,updated_ms
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`).run(
    id,String(input.message_id||""),soldMs,soldAt,client,qty,type,payment,unitPrice,total,String(input.source||"manual"),now,now
  );
  return id;
}
function insertControlExpense(input={},forcedId=""){
  if(!salesDb)throw new Error("Banco indisponível");
  const description=String(input.description||"").trim(),amount=Number(input.amount||0);
  if(!description||!Number.isFinite(amount)||amount<=0)throw new Error("Descrição e valor são obrigatórios");
  let spentMs,spentAt;
  if(input.spent_at){spentMs=Date.parse(input.spent_at);spentAt=new Date(spentMs).toISOString();}
  else{const d=controlIso(input.date||localDate(new Date().toISOString()),input.time||localTime(new Date().toISOString()).slice(0,5));spentMs=d.ms;spentAt=d.iso;}
  const now=Date.now(),id=forcedId||("expense:"+crypto.randomUUID());
  salesDb.prepare(`INSERT OR IGNORE INTO control_expenses(
    id,spent_ms,spent_at,description,amount,source,status,created_ms,updated_ms
  ) VALUES(?,?,?,?,?,?,'active',?,?)`).run(id,spentMs,spentAt,description,amount,String(input.source||"manual"),now,now);
  return id;
}
function listControlSales(){
  if(!salesDb)return[];
  return salesDb.prepare("SELECT * FROM control_sales WHERE status='active' ORDER BY sold_ms ASC").all().map(r=>({
    id:r.id,message_id:r.message_id||"",sold_at:r.sold_at,client:r.client,qty:Number(r.qty)||0,product_type:r.product_type,
    payment:r.payment,unit_price:Number(r.unit_price)||0,total_value:Number(r.total_value)||0,source:r.source||""
  }));
}
function listControlExpenses(){
  if(!salesDb)return[];
  return salesDb.prepare("SELECT * FROM control_expenses WHERE status='active' ORDER BY spent_ms ASC").all().map(r=>({
    id:r.id,spent_at:r.spent_at,description:r.description,amount:Number(r.amount)||0,source:r.source||""
  }));
}
function seedControlLedger(){
  const seed=[
    ["sale-2026-10-06-peixeiro-0909","AC86734AC7BCD95BD06567AF7132FE15","2026-10-06T09:09:42-03:00","Peixeiro Rua",1,"esc","PIX",7],
    ["sale-2026-10-06-perninha-0910","ACBAD486F62A62E14947C7FB929A7F63","2026-10-06T09:10:00-03:00","Alex Perninha",2,"esc","PIX",7],
    ["sale-2026-10-06-para-0954","AC29F9FD41B13175D83F88EB53F252C8","2026-10-06T09:54:27-03:00","Pará",7,"esc","PIX",6],
    ["sale-2026-10-06-thiago-0954","ACA9E5A584CA0C025DFB3E8860AC0898","2026-10-06T09:54:31-03:00","Thiago",2,"esc","PIX",6],
    ["sale-2026-10-06-campinho-0954","ACD0ADC4DFB1F237861C1DD990357ECD","2026-10-06T09:54:40-03:00","Alex Campinho",2,"esc","PIX",7],
    ["sale-2026-10-06-marcio-0954","ACED62DE6E10CD114D63E4D9C42DC99C","2026-10-06T09:54:53-03:00","Márcio",3,"esc","Dinheiro",7],
    ["sale-2026-10-06-clinica-filt-0955","ACC06CF75F2D088CC13A6D1403ECC2EF","2026-10-06T09:55:11-03:00","Caldo de cana - Clínica da Família",1,"filt","Dinheiro",13],
    ["sale-2026-10-06-clinica-esc-0955","ACC06CF75F2D088CC13A6D1403ECC2EF","2026-10-06T09:55:11-03:00","Caldo de cana - Clínica da Família",1,"esc","Dinheiro",7],
    ["sale-2026-10-06-praca-filt-0955","AC42B7F7880E12A3F9E62FE5D5BF17E9","2026-10-06T09:55:24-03:00","Caldo de cana ao lado de Márcio",1,"filt","Dinheiro",13],
    ["sale-2026-10-06-laranja-1010","AC098AB53C376FCF1DB2FB1CD7BE5DA6","2026-10-06T10:10:08-03:00","Laranja",10,"esc","Dinheiro",7],
    ["sale-2026-10-06-padaria-1021","AC2673DB2764340B878F6588CDF199BA","2026-10-06T10:21:00-03:00","Padaria Paciência",8,"esc","PIX",7],
    ["sale-2026-10-06-lilian-1052","AC48B74F959EA9BD1FC99B0A2240105F","2026-10-06T10:52:50-03:00","Lilian",4,"esc","PIX",7],
    ["sale-2026-10-06-tia-1053","AC8E3FF93AE51EEC5A2C73C1B8D94F56","2026-10-06T10:53:14-03:00","Tia",1,"filt","Dinheiro",13],
    ["sale-2026-10-06-custodio-1125","AC2EB49D9F92D64B9F74B273978B8ED3","2026-10-06T11:25:15-03:00","Custódio",2,"esc","PIX",7]
  ];
  for(const [id,message_id,sold_at,client,qty,product_type,payment,unit_price] of seed){
    insertControlSale({message_id,sold_at,client,qty,product_type,payment,unit_price,source:"history-recovered"},id);
  }
  const seed0210=[
    ["manual-2026-10-02-padaria-bmg","2026-10-02T12:00:00-03:00","Padaria BMG",2,"esc","Dinheiro",8],
    ["manual-2026-10-02-marcelo","2026-10-02T12:01:00-03:00","Marcelo",1,"filt","Dinheiro",13],
    ["manual-2026-10-02-alex-rua22","2026-10-02T12:02:00-03:00","Alex Rua 22",3,"esc","PIX",7],
    ["manual-2026-10-02-tiago","2026-10-02T12:03:00-03:00","Peixaria Tiago",4,"esc","PIX",6],
    ["manual-2026-10-02-para","2026-10-02T12:04:00-03:00","Peixaria Pará",7,"esc","PIX",6],
    ["manual-2026-10-02-ivan","2026-10-02T12:05:00-03:00","Ivan",2,"esc","Dinheiro",7],
    ["manual-2026-10-02-marcio","2026-10-02T12:06:00-03:00","Márcio",2,"esc","Dinheiro",7],
    ["manual-2026-10-02-inhoaiba-barraca-azul","2026-10-02T12:07:00-03:00","Inhoaíba Barraca Azul",1,"filt","Dinheiro",13],
    ["manual-2026-10-02-caldo-inhoaiba","2026-10-02T12:08:00-03:00","Caldo Inhoaíba",1,"filt","Dinheiro",10],
    ["manual-2026-10-02-marcelo-cosmos","2026-10-02T12:09:00-03:00","Marcelo Cosmos",1,"filt","Dinheiro",13],
    ["manual-2026-10-02-luiz-peixaria","2026-10-02T12:10:00-03:00","Luiz Peixaria",1,"esc","Dinheiro",8],
    ["manual-2026-10-02-padaria-paciencia","2026-10-02T12:11:00-03:00","Padaria Paciência",10,"esc","PIX",7],
    ["manual-2026-10-02-lilian","2026-10-02T12:12:00-03:00","Lilian",3,"esc","Dinheiro",7],
    ["manual-2026-10-02-sr-gilson","2026-10-02T12:13:00-03:00","Sr. Gilson",2,"filt","PIX",13],
    ["manual-2026-10-02-custodio","2026-10-02T12:14:00-03:00","Custódio",2,"esc","PIX",7]
  ];
  for(const [id,sold_at,client,qty,product_type,payment,unit_price] of seed0210){
    insertControlSale({sold_at,client,qty,product_type,payment,unit_price,source:"manual-photo-import"},id);
  }
  insertControlExpense({spent_at:"2026-10-02T18:00:00-03:00",description:"Ajudantes",amount:120,source:"manual-photo-import"},"expense-2026-10-02-ajudantes");
  insertControlExpense({spent_at:"2026-10-02T18:01:00-03:00",description:"GNV",amount:20,source:"manual-photo-import"},"expense-2026-10-02-gnv");
  insertControlExpense({spent_at:"2026-10-03T18:00:00-03:00",description:"Ajudante",amount:120,source:"manual-photo-import"},"expense-2026-10-03-ajudante");
  const seed0310=[
    ["manual-2026-10-03-alex-rua22","2026-10-03T12:00:00-03:00","Alex Rua 22",4,"esc","PIX",7],
    ["manual-2026-10-03-marcelo","2026-10-03T12:01:00-03:00","Marcelo",1,"filt","PIX",13],
    ["manual-2026-10-03-para","2026-10-03T12:02:00-03:00","Peixaria Pará",8,"esc","PIX",6],
    ["manual-2026-10-03-tiago","2026-10-03T12:03:00-03:00","Peixaria Tiago",2,"esc","PIX",6],

    ["manual-2026-10-03-ivan-a","2026-10-03T12:04:00-03:00","Ivan",3,"esc","Dinheiro",7],
    ["manual-2026-10-03-ivan-b","2026-10-03T12:05:00-03:00","Ivan",3,"esc","PIX",7],
    ["manual-2026-10-03-ivan-c","2026-10-03T12:06:00-03:00","Ivan",5,"esc","Dinheiro",7],

    ["manual-2026-10-03-marcio","2026-10-03T12:07:00-03:00","Márcio",2,"esc","Dinheiro",7],
    ["manual-2026-10-03-inhoaiba-barraca-azul","2026-10-03T12:08:00-03:00","Inhoaíba Barraca Azul",1,"filt","Dinheiro",13],
    ["manual-2026-10-03-padaria-paciencia","2026-10-03T12:09:00-03:00","Padaria Paciência",12,"esc","PIX",7],
    ["manual-2026-10-03-lilian","2026-10-03T12:10:00-03:00","Lilian",3,"esc","Dinheiro",7],

    ["manual-2026-10-03-churrasco-lilian","2026-10-03T12:11:00-03:00","Churrasco Lilian",1,"esc","PIX",7],
    ["manual-2026-10-03-churrasco-tia","2026-10-03T12:12:00-03:00","Churrasco Tia",1,"esc","PIX",7],
    ["manual-2026-10-03-sr-gilson","2026-10-03T12:13:00-03:00","Sr. Gilson",2,"filt","PIX",13],

    ["manual-2026-10-03-kinho-esc","2026-10-03T12:14:00-03:00","Kinho Sapateiro",8,"esc","Dinheiro",7],
    ["manual-2026-10-03-kinho-filt5","2026-10-03T12:15:00-03:00","Kinho Sapateiro",8,"filt","Dinheiro",5]
  ];
  for(const [id,sold_at,client,qty,product_type,payment,unit_price] of seed0310){
    insertControlSale({sold_at,client,qty,product_type,payment,unit_price,source:"manual-photo-import"},id);
  }

  insertControlExpense({spent_at:"2026-10-03T18:01:00-03:00",description:"GNV",amount:20,source:"manual-photo-import"},"expense-2026-10-03-gnv");

  const seed0410=[
    ["manual-2026-10-04-marcelo","2026-10-04T12:00:00-03:00","Marcelo",2,"filt","Dinheiro",13],
    ["manual-2026-10-04-padaria-bmg","2026-10-04T12:01:00-03:00","Padaria BMG",2,"esc","Dinheiro",8],
    ["manual-2026-10-04-alex-perninha","2026-10-04T12:02:00-03:00","Alex Perninha",2,"esc","PIX",7],
    ["manual-2026-10-04-para","2026-10-04T12:03:00-03:00","Pará",5,"esc","PIX",6],
    ["manual-2026-10-04-tiago","2026-10-04T12:04:00-03:00","Tiago",2,"esc","PIX",6],
    ["manual-2026-10-04-marcelo-cosmos","2026-10-04T12:05:00-03:00","Marcelo Cosmos",1,"filt","Dinheiro",13],
    ["manual-2026-10-04-seu-luiz","2026-10-04T12:06:00-03:00","Seu Luiz",1,"esc","Dinheiro",7],
    ["manual-2026-10-04-lilian","2026-10-04T12:07:00-03:00","Lilian",2,"esc","Dinheiro",7],
    ["manual-2026-10-04-churrasco-lilian","2026-10-04T12:08:00-03:00","Churrasco Lilian",2,"esc","Dinheiro",7],
    ["manual-2026-10-04-churrasco-tia","2026-10-04T12:09:00-03:00","Churrasco Tia",2,"esc","Dinheiro",7],
    ["manual-2026-10-04-filomena","2026-10-04T12:10:00-03:00","Filomena",7,"esc","Dinheiro",7],
    ["manual-2026-10-04-barraca-clinica","2026-10-04T12:11:00-03:00","Barraca Caldo Clínica da Família",1,"esc","PIX",7],
    ["manual-2026-10-04-seu-gilson","2026-10-04T12:12:00-03:00","Seu Gilson",2,"filt","PIX",13],
    ["manual-2026-10-04-ivan","2026-10-04T12:13:00-03:00","Ivan",6,"esc","Dinheiro",7],
    ["manual-2026-10-04-jonny","2026-10-04T12:14:00-03:00","Jonny",60,"esc","PIX",7]
  ];
  for(const [id,sold_at,client,qty,product_type,payment,unit_price] of seed0410){
    insertControlSale({sold_at,client,qty,product_type,payment,unit_price,source:"manual-user-import"},id);
  }
  insertControlExpense({spent_at:"2026-10-04T18:00:00-03:00",description:"Ajudantes",amount:200,source:"manual-user-import"},"expense-2026-10-04-ajudantes");
  insertControlExpense({spent_at:"2026-10-04T18:01:00-03:00",description:"GNV",amount:30,source:"manual-user-import"},"expense-2026-10-04-gnv");
  insertControlExpense({spent_at:"2026-10-04T18:02:00-03:00",description:"Álcool",amount:20,source:"manual-user-import"},"expense-2026-10-04-alcool");
  insertControlExpense({spent_at:"2026-10-04T18:03:00-03:00",description:"Bar",amount:30,source:"manual-user-import"},"expense-2026-10-04-bar");

  const seed0810=[
    ["manual-2026-10-08-marcelo","2026-10-08T09:41:00-03:00","Marcelo",2,"filt","PIX",13],
    ["manual-2026-10-08-ivan","2026-10-08T09:42:00-03:00","Ivan",6,"esc","Dinheiro",7],
    ["manual-2026-10-08-para","2026-10-08T09:43:00-03:00","Pará",10,"esc","PIX",6],
    ["manual-2026-10-08-tiago","2026-10-08T09:44:00-03:00","Tiago",3,"esc","PIX",6],
    ["manual-2026-10-08-alex-perninha","2026-10-08T09:45:00-03:00","Alex Perninha",3,"esc","Dinheiro",7],
    ["manual-2026-10-08-quinho-esc","2026-10-08T09:46:00-03:00","Quinho Sapateiro",8,"esc","PIX",7],
    ["manual-2026-10-08-quinho-filt5","2026-10-08T09:46:01-03:00","Quinho Sapateiro",4,"filt","PIX",5]
  ];
  for(const [id,sold_at,client,qty,product_type,payment,unit_price] of seed0810){
    insertControlSale({sold_at,client,qty,product_type,payment,unit_price,source:"manual-confirmed-report"},id);
  }

  const seed0110=[
    ["manual-2026-10-01-marcelo","2026-10-01T09:00:00-03:00","Marcelo",1,"filt","Dinheiro",13],
    ["manual-2026-10-01-perninha","2026-10-01T09:01:00-03:00","Alex Perninha",3,"esc","Dinheiro",7],
    ["manual-2026-10-01-para","2026-10-01T09:02:00-03:00","Pará",10,"esc","PIX",6],
    ["manual-2026-10-01-tiago","2026-10-01T09:03:00-03:00","Tiago",4,"esc","PIX",6],
    ["manual-2026-10-01-ivan","2026-10-01T09:04:00-03:00","Ivan",3,"esc","Dinheiro",7],
    ["manual-2026-10-01-marcio","2026-10-01T09:05:00-03:00","Márcio",3,"esc","Dinheiro",7],
    ["manual-2026-10-01-caldo-posto-filt","2026-10-01T09:06:00-03:00","Caldo de Cana Posto",1,"filt","Dinheiro",13],
    ["manual-2026-10-01-caldo-posto-esc","2026-10-01T09:06:01-03:00","Caldo de Cana Posto",1,"esc","Dinheiro",7],
    ["manual-2026-10-01-caldo-praca","2026-10-01T09:07:00-03:00","Caldo de Cana da Praça",1,"filt","Dinheiro",13],
    ["manual-2026-10-01-marcelo-cosmos","2026-10-01T09:08:00-03:00","Marcelo Cosmos",1,"filt","Dinheiro",13],
    ["manual-2026-10-01-seu-luiz","2026-10-01T09:09:00-03:00","Seu Luiz",2,"esc","Dinheiro",8],
    ["manual-2026-10-01-padaria-paciencia","2026-10-01T09:10:00-03:00","Padaria Paciência",8,"esc","PIX",7]
  ];
  for(const [id,sold_at,client,qty,product_type,payment,unit_price] of seed0110){
    insertControlSale({sold_at,client,qty,product_type,payment,unit_price,source:"manual-confirmed-report"},id);
  }
  insertControlExpense({spent_at:"2026-10-01T18:00:00-03:00",description:"Ajudante",amount:56,source:"manual-confirmed-report"},"expense-2026-10-01-ajudante");
  insertControlExpense({spent_at:"2026-10-01T18:01:00-03:00",description:"GNV",amount:20,source:"manual-confirmed-report"},"expense-2026-10-01-gnv");

  const seed0510=[
    ["manual-2026-10-05-padaria-bmg","2026-10-05T09:30:00-03:00","Padaria BMG",2,"esc","Dinheiro",8],
    ["manual-2026-10-05-para","2026-10-05T09:31:00-03:00","Pará",8,"esc","PIX",6],
    ["manual-2026-10-05-tiago","2026-10-05T09:32:00-03:00","Tiago",1,"esc","PIX",6],
    ["manual-2026-10-05-marcio","2026-10-05T09:33:00-03:00","Márcio",2,"esc","PIX",7],
    ["manual-2026-10-05-laranja","2026-10-05T09:34:00-03:00","Laranja",3,"esc","Dinheiro",7],
    ["manual-2026-10-05-padaria-paciencia","2026-10-05T09:35:00-03:00","Padaria Paciência",8,"esc","PIX",7],
    ["manual-2026-10-05-seu-gilson","2026-10-05T09:36:00-03:00","Seu Gilson",2,"filt","PIX",13]
  ];
  for(const [id,sold_at,client,qty,product_type,payment,unit_price] of seed0510){
    insertControlSale({sold_at,client,qty,product_type,payment,unit_price,source:"manual-confirmed-report"},id);
  }

  const seed0710=[
    ["manual-2026-10-07-padaria-bmg","2026-10-07T09:42:12-03:00","Padaria BMG",2,"esc","Dinheiro",8],
    ["manual-2026-10-07-marcelo","2026-10-07T09:42:19-03:00","Marcelo",2,"filt","Dinheiro",13],
    ["manual-2026-10-07-alex-perninha","2026-10-07T09:42:41-03:00","Alex Perninha",3,"esc","PIX",7],
    ["manual-2026-10-07-para","2026-10-07T09:42:49-03:00","Pará",5,"esc","PIX",6],
    ["manual-2026-10-07-tiago","2026-10-07T09:42:59-03:00","Tiago",3,"esc","PIX",6],
    ["manual-2026-10-07-alex-campinho","2026-10-07T09:43:12-03:00","Alex Campinho",1,"esc","PIX",7],
    ["manual-2026-10-07-barraca-sacolao","2026-10-07T09:44:12-03:00","Barraca Caldo de Cana Inhoaíba/Sacolão",1,"filt","Dinheiro",13],
    ["manual-2026-10-07-marcio","2026-10-07T09:44:23-03:00","Márcio",4,"esc","Dinheiro",7],
    ["manual-2026-10-07-caldo-clinica-filt","2026-10-07T10:00:00-03:00","Caldo do posto/clínica/esquerdo",1,"filt","PIX",13],
    ["manual-2026-10-07-caldo-clinica-esc","2026-10-07T10:00:01-03:00","Caldo do posto/clínica/esquerdo",1,"esc","PIX",7],
    ["manual-2026-10-07-marcelo-cosmos","2026-10-07T10:36:35-03:00","Marcelo Cosmos",1,"filt","Dinheiro",13],
    ["manual-2026-10-07-seu-luiz","2026-10-07T10:38:06-03:00","Seu Luiz",2,"esc","Dinheiro",8],
    ["manual-2026-10-07-padaria-paciencia","2026-10-07T10:40:00-03:00","Padaria Paciência",8,"esc","PIX",7],
    ["manual-2026-10-07-lilian","2026-10-07T10:41:00-03:00","Lilian",4,"esc","Dinheiro",7],
    ["manual-2026-10-07-seu-gilson","2026-10-07T10:42:00-03:00","Seu Gilson",1,"filt","PIX",13],
    ["manual-2026-10-07-custodio","2026-10-07T10:43:00-03:00","Custódio",2,"esc","PIX",7],
    ["manual-2026-10-07-seu-pedro","2026-10-07T10:44:00-03:00","Seu Pedro",4,"esc","PIX",7]
  ];
  for(const [id,sold_at,client,qty,product_type,payment,unit_price] of seed0710){
    insertControlSale({sold_at,client,qty,product_type,payment,unit_price,source:"manual-confirmed-report"},id);
  }
  insertControlExpense({spent_at:"2026-10-07T18:00:00-03:00",description:"GNV",amount:20,source:"manual-confirmed-report"},"expense-2026-10-07-gnv");
  insertControlExpense({spent_at:"2026-10-07T18:01:00-03:00",description:"Ajudante",amount:56,source:"manual-confirmed-report"},"expense-2026-10-07-ajudante");
  insertControlExpense({spent_at:"2026-10-07T18:02:00-03:00",description:"Camarão",amount:30,source:"manual-confirmed-report"},"expense-2026-10-07-camarao");
  insertControlExpense({spent_at:"2026-10-07T18:03:00-03:00",description:"Frutas",amount:20,source:"manual-confirmed-report"},"expense-2026-10-07-frutas");
  console.log("CONTROL_LEDGER_READY",JSON.stringify({sales:listControlSales().length,expenses:listControlExpenses().length}));
}

function normalizeQueueTimestamp(v){
  if(v==null||v==="")return Date.now();
  if(typeof v==="number")return v<1e12?v*1000:v;
  const s=String(v).trim();
  if(/^\d{10}$/.test(s))return Number(s)*1000;
  if(/^\d{13}$/.test(s))return Number(s);
  const t=Date.parse(s);return Number.isFinite(t)?t:Date.now();
}
function saleSenderAuthorized(item={}){
  const raw=String(item.remetente||item.sender||"").trim();
  if(!raw) return true; // preserva lançamentos manuais/locais sem remetente
  const phone=raw.replace(/@.*/,"").replace(/\D/g,"");
  const jid=raw;
  if(phone && authorizedHistoryPhones().has(phone)) return true;
  if(authorizedHistoryJids().has(jid)) return true;
  const name=String(item.nome_remetente||item.sender_name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return /\b(flavio|maira|luciano|tafa|tafarel|claudio|dinho)\b/.test(name);
}
function upsertPendingSale(item={}){
  if(!salesDb)throw new Error("Fila SQLite indisponível");
  const remoteId=String(item.remote_id||"").trim();
  if(!remoteId)return "invalid";
  if(!saleSenderAuthorized(item)){
    console.log("SALES_QUEUE_REJECT_UNAUTHORIZED",JSON.stringify({remote_id:remoteId,remetente:String(item.remetente||item.sender||""),nome:String(item.nome_remetente||item.sender_name||"")}));
    return "unauthorized";
  }
  const messageId=String(item.message_id||item.remote_key||remoteId).replace(/^mensagem:/,"").trim();
  const now=Date.now();
  const receivedMs=normalizeQueueTimestamp(item.recebido_em||item.timestamp_ms||item.timestamp);
  const existing=salesDb.prepare("SELECT status FROM sales_queue WHERE remote_id=?").get(remoteId);
  if(existing){
    if(existing.status==="pending"){
      salesDb.prepare(`UPDATE sales_queue SET
        remote_key=?,message_id=?,received_ms=?,received_at=?,transcription=?,client=?,qty=?,product_type=?,payment=?,confidence=?,sender=?,sender_name=?,updated_ms=?
        WHERE remote_id=? AND status='pending'`).run(
          String(item.remote_key||""),messageId,receivedMs,String(item.recebido_em||new Date(receivedMs).toISOString()),
          String(item.transcricao||item.transcription||""),String(item.cliente||item.client||""),Number(item.qtd||item.qty||0),
          String(item.tipo||item.product_type||""),String(item.pagamento||item.payment||"Não informado"),
          String(item.confianca||item.confidence||""),String(item.remetente||item.sender||""),
          String(item.nome_remetente||item.sender_name||""),now,remoteId
        );
    }
    return "existing";
  }
  salesDb.prepare(`INSERT INTO sales_queue(
    remote_id,remote_key,message_id,received_ms,received_at,transcription,client,qty,product_type,payment,confidence,sender,sender_name,status,created_ms,updated_ms
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`).run(
    remoteId,String(item.remote_key||""),messageId,receivedMs,String(item.recebido_em||new Date(receivedMs).toISOString()),
    String(item.transcricao||item.transcription||""),String(item.cliente||item.client||""),Number(item.qtd||item.qty||0),
    String(item.tipo||item.product_type||""),String(item.pagamento||item.payment||"Não informado"),
    String(item.confianca||item.confidence||""),String(item.remetente||item.sender||""),
    String(item.nome_remetente||item.sender_name||""),now,now
  );
  return "inserted";
}
function listPendingSales(){
  if(!salesDb)return[];
  const rows=salesDb.prepare("SELECT * FROM sales_queue WHERE status='pending' ORDER BY received_ms ASC").all();
  return rows.map(r=>({
    remote_id:r.remote_id,remote_key:r.remote_key,message_id:r.message_id,
    recebido_em:r.received_at||new Date(Number(r.received_ms)||Date.now()).toISOString(),
    timestamp_ms:Number(r.received_ms)||0,transcricao:r.transcription||"",
    cliente:r.client||"",qtd:Number(r.qty)||0,tipo:r.product_type||"",
    pagamento:r.payment||"Não informado",confianca:r.confidence||"",
    remetente:r.sender||"",nome_remetente:r.sender_name||"",status:r.status
  }));
}
function mapSaleRow(r){
  return {
    remote_id:r.remote_id,remote_key:r.remote_key,message_id:r.message_id,
    recebido_em:r.received_at||new Date(Number(r.received_ms)||Date.now()).toISOString(),
    timestamp_ms:Number(r.received_ms)||0,transcricao:r.transcription||"",
    cliente:r.client||"",qtd:Number(r.qty)||0,tipo:r.product_type||"",
    pagamento:r.payment||"Não informado",confianca:r.confidence||"",
    remetente:r.sender||"",nome_remetente:r.sender_name||"",status:r.status,
    launched_ms:Number(r.launched_ms)||0,deleted_ms:Number(r.deleted_ms)||0,archived_ms:Number(r.archived_ms)||0
  };
}
function listSalesByLocalDateRange(targetDate,inicio="00:00:00",fim="23:59:59"){
  if(!salesDb)return[];
  const rows=salesDb.prepare("SELECT * FROM sales_queue ORDER BY received_ms ASC").all();
  return rows.filter(r=>{
    const iso=r.received_at||new Date(Number(r.received_ms)||0).toISOString();
    const d=localDate(iso),h=localTime(iso);
    const mapped=mapSaleRow(r);
    return d===targetDate && !!h && h>=inicio && h<=fim && saleSenderAuthorized(mapped);
  }).map(mapSaleRow);
}
function logRecentSalesForAgent(days=2){
  if(!salesDb)return;
  const cutoff=Date.now()-Math.max(1,Number(days)||2)*86400000;
  const rows=salesDb.prepare("SELECT * FROM sales_queue WHERE received_ms>=? ORDER BY received_ms ASC").all(cutoff);
  for(const row of rows){
    const v=mapSaleRow(row);
    console.log("SALES_HISTORY_ROW",JSON.stringify(v));
  }
  console.log("SALES_HISTORY_READY",JSON.stringify({rows:rows.length,days}));
}
function setSaleStatus(remoteId,status){
  if(!salesDb)return 0;
  const now=Date.now();
  let extra="";
  if(status==="launched")extra=", launched_ms="+now;
  else if(status==="deleted")extra=", deleted_ms="+now;
  else if(status==="archived")extra=", archived_ms="+now;
  const r=salesDb.prepare("UPDATE sales_queue SET status=?, updated_ms=?"+extra+" WHERE remote_id=?").run(status,now,String(remoteId));
  return Number(r.changes||0);
}
function deleteSalesByMessageId(messageId){
  if(!salesDb)return 0;
  const now=Date.now();
  const r=salesDb.prepare("UPDATE sales_queue SET status='deleted',updated_ms=?,deleted_ms=? WHERE message_id=? AND status!='deleted'").run(now,now,String(messageId));
  return Number(r.changes||0);
}
function archivePendingSales(now=Date.now()){
  if(!salesDb)return 0;
  const r=salesDb.prepare("UPDATE sales_queue SET status='archived',updated_ms=?,archived_ms=? WHERE status='pending'").run(now,now);
  return Number(r.changes||0);
}
function salesQueueStats(){
  if(!salesDb)return{};
  const rows=salesDb.prepare("SELECT status,COUNT(*) total FROM sales_queue GROUP BY status").all();
  return Object.fromEntries(rows.map(r=>[r.status,Number(r.total)||0]));
}
function ingestSaleTextDirect({messageId,text,timestamp,sender,senderName}={}){
  const raw=String(text||"").trim();
  const mid=String(messageId||"").trim();
  if(!raw||!mid)return {inserted:0,existing:0,total:0};
  const vendas=interpretarVendas(raw).filter(v=>v&&v.cliente&&Number(v.total_sacos)>0);
  let inserted=0,existing=0,total=0;
  vendas.forEach((v,idx)=>{
    const baseId="mensagem:"+mid;
    const base={
      remote_key:baseId,
      message_id:mid,
      recebido_em:String(timestamp||new Date().toISOString()),
      transcricao:raw,
      cliente:String(v.cliente||""),
      pagamento:String(v.pagamento||"Não informado"),
      confianca:v.precisa_revisao?"revisar":"alta",
      remetente:String(sender||""),
      nome_remetente:String(senderName||"")
    };
    for(const [tipo,q,suf] of [["esc",v.escamas,"esc"],["filt",v.filtrado,"filt"]]){
      if(Number(q)<=0)continue;
      const remoteId=vendas.length===1?(baseId+":"+suf):(baseId+":v"+idx+":"+suf);
      const r=upsertPendingSale({...base,remote_id:remoteId,qtd:Number(q),tipo});
      total++;
      if(r==="inserted")inserted++;
      else if(r==="existing")existing++;
    }
  });
  if(total)console.log("SALES_QUEUE_DIRECT_INGEST",JSON.stringify({messageId:mid,inserted,existing,total,text:raw.slice(0,120)}));
  return {inserted,existing,total};
}

function readSalesSyncState() {
  try {
    const s=JSON.parse(fs.readFileSync(SALES_SYNC_STATE_FILE,"utf8")||"{}");
    return {date:String(s?.date||""),cutoff:Number(s?.cutoff||0)||0,ignored_ids:Array.isArray(s?.ignored_ids)?s.ignored_ids.map(String):[]};
  } catch { return {date:"",cutoff:0,ignored_ids:[]}; }
}
function writeSalesSyncState(state) {
  const clean={date:String(state?.date||""),cutoff:Number(state?.cutoff||0)||0,ignored_ids:Array.isArray(state?.ignored_ids)?[...new Set(state.ignored_ids.map(String))].slice(-5000):[]};
  atomicWriteJson(SALES_SYNC_STATE_FILE,clean);
  return clean;
}
function readClients() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]"); }
  catch { return []; }
}
function writeClients(clients) {
  atomicWriteJson(DATA_FILE,clients);
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
  atomicWriteJson(EXTERNAL_STATE_FILE,clean);
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
  atomicWriteJson(WUZAPI_HISTORY_FILE,recent);
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
  atomicWriteJson(WUZAPI_HISTORY_FILE,all.slice(-5000));
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
  const raw=String(p?.Data??p?.data??"").trim();
  // WuzAPI returns a Data URL. Audio MIME can contain parameters such as
  // "audio/ogg; codecs=opus", so the prefix is not always "mime;base64,".
  const comma=raw.indexOf(",");
  const candidate=/^data:/i.test(raw) && comma>=0 ? raw.slice(comma+1) : raw;
  const clean=candidate.replace(/\s+/g,"");
  if(!clean || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length%4!==0){
    console.error("WuzAPI retornou áudio em formato base64 inválido", {prefix:raw.slice(0,80),length:raw.length});
    return "";
  }
  return clean;
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
  try{
    const r=ingestSaleTextDirect({
      messageId:id,
      text:transcricao,
      timestamp:String(timestamp||new Date().toISOString()),
      sender:senderPhone+"@s.whatsapp.net",
      senderName:String(person||"Remetente")
    });
    console.log("AUDIO_HISTORY_REINGEST",JSON.stringify({message_id:id,...r}));
  }catch(e){console.error("Falha ao relançar transcrição histórica:",e?.message||e)}
  return {ok:true,transcricao,interpretacao:result?.interpretacao||null};
}
async function recoverSpecificAuthorizedAudioIds(targetDate, ids=[]) {
  const wanted=new Set((Array.isArray(ids)?ids:[]).map(v=>String(v||"").trim()).filter(Boolean));
  if(!wanted.size) return {processed:0,failed:0,total:0};
  const business=await findExistingBusinessUser();
  const token=String(business?.token || business?.Token || "").trim();
  if(!token) return {processed:0,failed:0,total:0};
  const people=[
    {nome:"Cláudio",jids:String(SEED_CLIENT_PHONE||"").replace(/\D/g,"")?[String(SEED_CLIENT_PHONE||"").replace(/\D/g,"")+"@s.whatsapp.net"]:[]},
    {nome:"Tafarel",jids:helperJidsByName("Tafarel")},
    {nome:"Maíra",jids:helperJidsByName("Maíra")}
  ];
  const jobs=[],seen=new Set();
  for(const p of people){
    for(const jid of p.jids){
      try{
        const h=await wuz("/chat/history?chat_jid="+encodeURIComponent(jid)+"&limit=1000",{headers:userHeaders(token)});
        const arr=Array.isArray(h?.data)?h.data:Array.isArray(h)?h:[];
        for(const m of arr){
          const id=String(m?.message_id||"").trim();
          if(!id||!wanted.has(id)||seen.has(id)||localDate(m?.timestamp)!==targetDate) continue;
          const raw=rawHistoryObject(m);
          const audio=audioMessageFromObject(raw);
          if(!audio) continue;
          seen.add(id);
          jobs.push({token,messageId:id,timestamp:m?.timestamp,person:p.nome,senderJid:m?.sender_jid||"",senderAlt:m?.sender_alt||"",chatJid:m?.chat_jid||jid,audio});
        }
      }catch(e){
        console.error("Falha ao preparar áudio específico autorizado:",e?.message||e);
      }
    }
  }
  let processed=0,failed=0;
  for(const job of jobs){
    const done=await processAuthorizedHistoricalAudio(job).catch(e=>{
      console.error("Falha ao recuperar áudio específico autorizado:",job?.messageId||"",e?.message||e);
      return null;
    });
    if(done) processed++; else failed++;
    await new Promise(r=>setTimeout(r,250));
  }
  return {processed,failed,total:jobs.length};
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
function dateFromTimestamp(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{13}$/.test(s)) {
    const d = new Date(Number(s));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function localDate(iso) {
  const d = dateFromTimestamp(iso);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(d);
  const v = Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${v.year}-${v.month}-${v.day}`;
}
function localTime(iso) {
  const d = dateFromTimestamp(iso);
  if (!d) return "";
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

    // A fonte principal do histórico agora é o SQLite persistente do Railway.
    // Ele preserva também vendas já lançadas, arquivadas ou excluídas.
    let inbox = listSalesByLocalDateRange(targetDate,inicio,fim);
    if(!inbox.length){
      try {
        const inboxResp = await fetch(GELO_INBOX_URL, { headers:{Accept:"application/json"} });
        const inboxData = await inboxResp.json().catch(()=>({}));
        inbox = inboxResp.ok && Array.isArray(inboxData?.vendas) ? inboxData.vendas : [];
      } catch (e) {
        console.error("Falha ao usar fallback da inbox no histórico diário:", e?.message || e);
      }
    }

    const vendas = inbox.filter(v => {
      const id = String(v?.message_id || v?.remote_key || "").replace(/^mensagem:/, "");
      const remetente = String(v?.remetente || "").replace(/\D/g, "");
      return localDate(v?.recebido_em) === targetDate &&
        dentroDaFaixa(v?.recebido_em) &&
        (!ids.size || ids.has(id) || Object.values(phonesByName).includes(remetente));
    }).map(v => {
      const id = String(v?.message_id || v?.remote_key || "").replace(/^mensagem:/, "");
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
        status:v.status||"",
        remote_key:v.remote_key,
        remote_id:v.remote_id||""
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

function salesAssistantAuthorized(req){
  const supplied=String(req.headers["x-sales-assistant-token"]||"");
  return !!SALES_ASSISTANT_TOKEN && safeTextEqual(supplied,SALES_ASSISTANT_TOKEN);
}

app.get("/api/assistant/vendas-dia",(req,res)=>{
  try{
    if(!salesAssistantAuthorized(req)) return res.status(401).json({error:"Não autorizado"});
    const data=String(req.query?.data||"").trim();
    const targetDate=/^\d{4}-\d{2}-\d{2}$/.test(data)?data:new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const norm=(v,fallback)=>{const m=String(v||"").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);if(!m)return fallback;return String(Math.min(23,+m[1])).padStart(2,"0")+":"+String(Math.min(59,+m[2])).padStart(2,"0")+":"+String(Math.min(59,+(m[3]||0))).padStart(2,"0")};
    const inicio=norm(req.query?.inicio,"00:00:00"),fim=norm(req.query?.fim,"23:59:59");
    const vendas=listSalesByLocalDateRange(targetDate,inicio,fim);
    return res.json({ok:true,data:targetDate,faixa:{inicio,fim},total:vendas.length,vendas});
  }catch(e){
    console.error("Falha ao consultar vendas do assistente:",e?.message||e);
    return res.status(500).json({ok:false,error:e?.message||"Falha ao consultar vendas"});
  }
});

app.post("/api/assistant/vendas-pendentes",(req,res)=>{
  try{
    if(!salesAssistantAuthorized(req)) return res.status(401).json({error:"Não autorizado"});
    const date=String(req.body?.data||"").trim();
    const time=String(req.body?.hora||"").trim();
    const client=String(req.body?.cliente||"Pendente").trim().slice(0,120)||"Pendente";
    const qty=Number(req.body?.qtd);
    const product=String(req.body?.tipo||"").trim().toLowerCase();
    const payment=String(req.body?.pagamento||"Pendente").trim().slice(0,80)||"Pendente";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({error:"data inválida; use AAAA-MM-DD"});
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return res.status(400).json({error:"hora inválida; use HH:MM"});
    if(!Number.isInteger(qty)||qty<1||qty>10000) return res.status(400).json({error:"qtd deve ser um número inteiro entre 1 e 10000"});
    if(!["esc","filt"].includes(product)) return res.status(400).json({error:"tipo deve ser esc ou filt"});
    const hhmmss=time.length===5?time+":00":time;
    const receivedAt=date+"T"+hhmmss+"-03:00";
    if(!Number.isFinite(Date.parse(receivedAt))) return res.status(400).json({error:"data e hora inválidas"});
    const id="assistant:"+crypto.randomUUID();
    const result=upsertPendingSale({
      remote_id:id,remote_key:id,message_id:id,recebido_em:receivedAt,
      cliente:client,qtd:qty,tipo:product,pagamento:payment,
      confianca:"manual",remetente:"",nome_remetente:""
    });
    if(result!=="inserted") return res.status(500).json({error:"Não foi possível incluir a venda pendente",result});
    return res.status(201).json({ok:true,status:"pending",venda:{remote_id:id,data:date,hora:hhmmss,cliente:client,qtd:qty,tipo:product,pagamento:payment}});
  }catch(e){
    console.error("Falha ao incluir venda pendente do assistente:",e?.message||e);
    return res.status(500).json({ok:false,error:e?.message||"Falha ao incluir venda"});
  }
});

app.get("/api/agent/vendas-dia", (req,res)=>{
  try{
    if(!agentAuthorized(req)) return res.status(401).json({error:"Não autorizado"});
    const data=String(req.query?.data||"").trim();
    const targetDate=/^\d{4}-\d{2}-\d{2}$/.test(data)?data:new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const norm=(v,fallback)=>{const m=String(v||"").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);if(!m)return fallback;return String(Math.min(23,+m[1])).padStart(2,"0")+":"+String(Math.min(59,+m[2])).padStart(2,"0")+":"+String(Math.min(59,+(m[3]||0))).padStart(2,"0")};
    const inicio=norm(req.query?.inicio,"00:00:00"),fim=norm(req.query?.fim,"23:59:59");
    const vendas=listSalesByLocalDateRange(targetDate,inicio,fim);
    return res.json({ok:true,data:targetDate,faixa:{inicio,fim},total:vendas.length,vendas});
  }catch(e){
    console.error("Falha ao consultar vendas do dia:",e?.message||e);
    return res.status(500).json({ok:false,error:e?.message||"Falha ao consultar vendas"});
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

    const rawMainEntry={
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
    };
    appendWuzapiHistory(rawMainEntry);
    if(isAuthorizedHistoryEntry(rawMainEntry)){
      console.log("AUTHORIZED_RAW_MESSAGE_SAVED",JSON.stringify({
        message_id:rawMainEntry.message_id,
        timestamp:rawMainEntry.timestamp,
        pessoa:rawMainEntry.pessoa,
        sender:rawMainEntry.sender_alt||rawMainEntry.sender_jid,
        tipo:rawMainEntry.tipo,
        texto:rawMainEntry.texto
      }));
    }

    const directEntry={
      message_id:String(info?.ID || info?.Id || info?.id || ""),
      timestamp:String(info?.Timestamp || new Date().toISOString()),
      pessoa:String(info?.PushName || "").trim() || "Remetente",
      sender_jid:String(info?.Sender || ""),
      sender_alt:String(info?.SenderAlt || ""),
      chat_jid:String(info?.Chat || ""),
      texto:String(text || ""),
      transcricao:String(text || ""),
      is_from_me:info?.IsFromMe === true,
      is_group:info?.IsGroup === true
    };
    if(info?.IsFromMe===false && info?.IsGroup===false && String(text||"").trim() && isAuthorizedHistoryEntry(directEntry)){
      try{
        ingestSaleTextDirect({
          messageId:directEntry.message_id,
          text,
          timestamp:directEntry.timestamp,
          sender:directEntry.sender_alt||directEntry.sender_jid,
          senderName:directEntry.pessoa
        });
      }catch(e){console.error("Falha no lançamento direto da venda recebida:",e?.message||e)}
    }

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

  // Preserva primeiro a mensagem bruta de qualquer ajudante autorizado.
  // A interpretação da venda acontece depois e nunca substitui este histórico.
  const rawAuthorizedEntry={
    message_id:String(info?.ID || info?.Id || info?.id || ""),
    timestamp:String(info?.Timestamp || new Date().toISOString()),
    pessoa:String(info?.PushName || c.businessName || c.name || "Remetente"),
    sender_jid:senderJid,
    sender_alt:senderAltJid,
    chat_jid:chatJid,
    tipo:String(info?.Type || ""),
    texto:String(text || ""),
    transcricao:String(text || ""),
    is_from_me:info?.IsFromMe === true,
    is_group:info?.IsGroup === true,
    origem:"wuzapi-client-raw"
  };
  if(isAuthorizedHistoryEntry({...rawAuthorizedEntry,is_from_me:false})){
    appendWuzapiHistory({...rawAuthorizedEntry,is_from_me:false});
    console.log("AUTHORIZED_RAW_MESSAGE_SAVED",JSON.stringify({
      message_id:rawAuthorizedEntry.message_id,
      timestamp:rawAuthorizedEntry.timestamp,
      sender:rawAuthorizedEntry.sender_alt||rawAuthorizedEntry.sender_jid,
      tipo:rawAuthorizedEntry.tipo,
      tem_texto:!!rawAuthorizedEntry.texto
    }));
  }

  // Se uma instância interna/autorizada estiver enviando uma venda, encaminha ao Worker
  // usando o número real do remetente. Isso cobre eventos em que o destino chega apenas como LID
  // e o WuzAPI não fornece RecipientAlt.
  try {
    const recipientPhone = String(info?.RecipientAlt || "")
      .replace("@s.whatsapp.net", "")
      .replace(/\D/g, "");
    const outboundSenderPhone = String(info?.SenderAlt || info?.Sender || "")
      .replace(/@.*/, "")
      .replace(/\D/g, "");
    const ownClientPhone = String(c?.phone || "").replace(/\D/g, "");
    const forwardedPhone = outboundSenderPhone || ownClientPhone;
    const forwardedText = String(text || "").trim();
    const looksLikeSale = /\b\d{1,3}\b/.test(forwardedText) &&
      /(escam|filtrad|saco|sacos|pix|fiad|dinheiro|pagou|pago)/i.test(forwardedText);
    const senderAllowed = !!forwardedPhone && (
      forwardedPhone === String(SEED_CLIENT_PHONE || "").replace(/\D/g, "") ||
      INTERNAL_SALE_SENDERS.includes(forwardedPhone) ||
      forwardedPhone === ownClientPhone
    );

    let destinationIsMain = false;
    if (info?.IsFromMe === true && recipientPhone) {
      const business = await findExistingBusinessUser();
      const businessJid = String(business?.jid || business?.Jid || "")
        .replace(/@.*/, "")
        .replace(/\D/g, "");
      destinationIsMain = !!businessJid && recipientPhone === businessJid;
    }

    // Se RecipientAlt sumir por causa do LID, aceita apenas texto com formato de venda
    // vindo de uma instância interna conhecida. O Worker continua sendo quem interpreta.
    const shouldRelay = info?.IsFromMe === true && senderAllowed && forwardedText &&
      (destinationIsMain || (!recipientPhone && looksLikeSale));

    if (shouldRelay) {
      const forwardedId=String(info?.ID || info?.Id || info?.id || ("relay-"+Date.now()));
      const forwardedTs=String(info?.Timestamp || new Date().toISOString());

      appendWuzapiHistory({
        message_id:forwardedId,
        timestamp:forwardedTs,
        pessoa:String(c.businessName || c.name || "Remetente"),
        sender_jid:forwardedPhone+"@s.whatsapp.net",
        sender_alt:forwardedPhone+"@s.whatsapp.net",
        chat_jid:String(info?.Chat || forwardedPhone+"@s.whatsapp.net"),
        tipo:String(info?.Type || "text"),
        texto:forwardedText,
        transcricao:forwardedText,
        is_from_me:false,
        is_group:false,
        origem:"relay-local"
      });

      try{
        ingestSaleTextDirect({
          messageId:forwardedId,
          text:forwardedText,
          timestamp:forwardedTs,
          sender:forwardedPhone,
          senderName:String(c.businessName || c.name || "Remetente")
        });
      }catch(e){console.error("Falha no lançamento direto da venda interna:",e?.message||e)}

      await fetch("https://gelo-tutoia-whatsapp.claudio41cg.workers.dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          forwardedToGeloTest: true,
          forwardedTestSenderPhone: forwardedPhone
        })
      });
      console.log("Venda interna enviada ao Worker a partir de", c.businessName || c.name, forwardedPhone);
    }
  } catch (e) {
    console.error("Falha ao encaminhar venda interna ao Worker:", e?.message || e);
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
