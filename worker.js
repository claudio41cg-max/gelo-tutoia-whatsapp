const VERIFY_TOKEN="gelo-tutoia-2026";
const GRAPH_VERSION="v26.0";
const TRANSCRIBE_MODEL="@cf/openai/whisper-large-v3-turbo";

const CLIENTES=[
"Seu Pedro","Henrique","Marcelo 1","Padaria BMG","Peixaria Ronald","Alex Rua 22","Peixaria Tiago","Peixaria Pará","Barraca Condomínio","Alex Campinho","Marcão","Alex Baiano","Maria Helieide","Márcio","Caldo Inhoaíba","Marcelo 2","Alex Laranja","Chop Feira","Churrasco Cosmos","Luiz Peixaria","Padaria Paciência","Salão Piscina","Lilian","Churrasco 1 L","Bruno","Chatuba","Tia","Churrasco 2 T","Sr. Gilson","Peixaria Bacaxá","Custódio","Gelo 22","Cliente Rua","Jonny Feira"
];

const NUMEROS={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20};

function normalizar(t=""){return String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();}

const ALIASES_FIXOS={
"caldo de cana":"Marcelo 1","marcelo caldo de cana":"Marcelo 1","marcelo um":"Marcelo 1",
"marcelo cosmos":"Marcelo 2","marcelo dois":"Marcelo 2",
"padaria":"Padaria BMG","bmg":"Padaria BMG","padaria bmg":"Padaria BMG",
"padaria paciencia":"Padaria Paciência","padaria de paciencia":"Padaria Paciência",
"condominio":"Barraca Condomínio","barraca condominio":"Barraca Condomínio","barraca do condominio":"Barraca Condomínio",
"para":"Peixaria Pará","seu para":"Peixaria Pará","sr para":"Peixaria Pará","senhor para":"Peixaria Pará","peixaria para":"Peixaria Pará","peixaria do para":"Peixaria Pará",
"tiago":"Peixaria Tiago","seu tiago":"Peixaria Tiago","sr tiago":"Peixaria Tiago","senhor tiago":"Peixaria Tiago","peixaria tiago":"Peixaria Tiago","peixaria do tiago":"Peixaria Tiago",
"ronald":"Peixaria Ronald","seu ronald":"Peixaria Ronald","sr ronald":"Peixaria Ronald","senhor ronald":"Peixaria Ronald","peixaria ronald":"Peixaria Ronald","peixaria do ronald":"Peixaria Ronald",
"perninha":"Alex Rua 22","alex perninha":"Alex Rua 22","seu perninha":"Alex Rua 22","sr perninha":"Alex Rua 22","senhor perninha":"Alex Rua 22","alex vinte e dois":"Alex Rua 22","alex rua vinte e dois":"Alex Rua 22","alex rua 22":"Alex Rua 22",
"alex campinho":"Alex Campinho","peixaria alex campinho":"Alex Campinho","peixaria do alex campinho":"Alex Campinho","seu alex campinho":"Alex Campinho","sr alex campinho":"Alex Campinho","senhor alex campinho":"Alex Campinho",
"filomena":"Maria Helieide","peixaria filomena":"Maria Helieide","peixaria da filomena":"Maria Helieide","maria filomena":"Maria Helieide","maria helieide":"Maria Helieide","helieide":"Maria Helieide",
"jorge":"Peixaria Bacaxá","seu jorge":"Peixaria Bacaxá","sr jorge":"Peixaria Bacaxá","senhor jorge":"Peixaria Bacaxá","peixaria jorge":"Peixaria Bacaxá","peixaria do jorge":"Peixaria Bacaxá","peixaria bacaxa":"Peixaria Bacaxá","bacaxa":"Peixaria Bacaxá","bacacha":"Peixaria Bacaxá","peixaria bacacha":"Peixaria Bacaxá",
"luiz":"Luiz Peixaria","seu luiz":"Luiz Peixaria","sr luiz":"Luiz Peixaria","senhor luiz":"Luiz Peixaria","luiz peixaria":"Luiz Peixaria","peixaria luiz":"Luiz Peixaria","peixaria do luiz":"Luiz Peixaria",
"pedro":"Seu Pedro","seu pedro":"Seu Pedro","sr pedro":"Seu Pedro","senhor pedro":"Seu Pedro",
"gilson":"Sr. Gilson","seu gilson":"Sr. Gilson","sr gilson":"Sr. Gilson","senhor gilson":"Sr. Gilson",
"jonny":"Jonny Feira","joni":"Jonny Feira","jonny feira":"Jonny Feira","joni feira":"Jonny Feira",
"chop":"Chop Feira","chop feira":"Chop Feira",
"salao":"Salão Piscina","salao piscina":"Salão Piscina","piscina":"Salão Piscina",
"cliente da rua":"Cliente Rua","cliente rua":"Cliente Rua","rua":"Cliente Rua",
"gelo vinte e dois":"Gelo 22","gelo 22":"Gelo 22",
"caldo inhoaiba":"Caldo Inhoaíba","inhoaiba":"Caldo Inhoaíba",
"churrasco cosmos":"Churrasco Cosmos"
};

function criarAliases(){
  const m=new Map();
  for(const [a,c] of Object.entries(ALIASES_FIXOS))m.set(normalizar(a),c);
  for(const c of CLIENTES){
    const n=normalizar(c);m.set(n,c);
    const semTitulo=n.replace(/^(seu|sr|senhor)\s+/,"");
    if(semTitulo!==n){m.set(semTitulo,c);m.set("seu "+semTitulo,c);m.set("sr "+semTitulo,c);m.set("senhor "+semTitulo,c);}
    if(n.startsWith("peixaria ")){
      const b=n.replace(/^peixaria\s+/,"");m.set(b,c);m.set("seu "+b,c);m.set("sr "+b,c);m.set("senhor "+b,c);m.set("peixaria do "+b,c);
    }
    if(n.endsWith(" peixaria")){
      const b=n.replace(/\s+peixaria$/,"");m.set(b,c);m.set("seu "+b,c);m.set("sr "+b,c);m.set("senhor "+b,c);m.set("peixaria "+b,c);m.set("peixaria do "+b,c);
    }
  }
  for(const amb of ["alex","marcelo","churrasco"])m.delete(amb);
  return [...m.entries()].sort((a,b)=>b[0].length-a[0].length);
}
const ALIASES_CLIENTES=criarAliases();

function contemAlias(t,a){return new RegExp(`(?:^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?:$|\\s)`).test(t);}
function identificarCliente(texto){const t=normalizar(texto);for(const [a,c] of ALIASES_CLIENTES){if(contemAlias(t,a))return c;}return null;}
function primeiroNumero(texto){const t=normalizar(texto);const d=t.match(/\b(\d+)\b/);if(d)return Number(d[1]);for(const [p,v] of Object.entries(NUMEROS))if(new RegExp(`\\b${p}\\b`).test(t))return v;return null;}
function numeroAntesDe(texto,termo){const t=normalizar(texto),ps=Object.keys(NUMEROS).join("|");const m=t.match(new RegExp(`(?:\\b(\\d+)\\b|\\b(${ps})\\b)(?:\\s+sacos?)?\\s+(?:de\\s+)?${termo}`));return m?(m[1]?Number(m[1]):NUMEROS[m[2]]):null;}

function parseVenda(texto){
  const original=String(texto||"").trim(),t=normalizar(original),cliente=identificarCliente(original);
  let pagamento="Não informado";if(/\bfiado\b/.test(t))pagamento="Fiado";else if(/\bpix\b/.test(t))pagamento="PIX";else if(/\bpago\b|\bdinheiro\b/.test(t))pagamento="Dinheiro";
  let filtrado=numeroAntesDe(original,"filtrado(?:s)?"),escamas=numeroAntesDe(original,"escamas?");
  const tf=/\bfiltrado(?:s)?\b/.test(t),te=/\bescamas?\b/.test(t);
  if(filtrado==null&&escamas==null){const q=primeiroNumero(original);if(q!=null){if(tf&&!te)filtrado=q;else escamas=q;}}
  filtrado=filtrado||0;escamas=escamas||0;const total=filtrado+escamas;
  return {cliente,escamas,filtrado,quantidade_total:total,pagamento,texto_original:original,status:"pendente_revisao",confianca:cliente&&total>0?"alta":"revisar"};
}

async function getWhatsAppMediaInfo(id,token){const r=await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${id}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Falha ao consultar mídia na Meta: HTTP ${r.status}`);return r.json();}
async function downloadWhatsAppMedia(url,token){const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Falha ao baixar mídia da Meta: HTTP ${r.status}`);return r.arrayBuffer();}
function arrayBufferToBase64(ab){const b=new Uint8Array(ab);let s="";for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode(...b.subarray(i,Math.min(i+0x8000,b.length)));return btoa(s);}
async function transcreverAudio(env,ab){if(!env.AI)throw new Error("binding AI não disponível");const r=await env.AI.run(TRANSCRIBE_MODEL,{audio:arrayBufferToBase64(ab),task:"transcribe",language:"pt",vad_filter:true,initial_prompt:"Vendas de gelo. Preserve nomes de clientes e apelidos como Perninha, Filomena, Jorge, Seu Jorge, Seu Luiz, Peixaria, Padaria, quantidades, PIX, dinheiro, fiado, escamas e filtrado."});return String(r?.text||"").trim();}
function chaveMensagem(r){return `mensagem:${r.mensagem_id||`sem-id-${Date.now()}`}`;}
async function salvarMensagemNoKV(env,r){if(!env.VENDAS)return null;const k=chaveMensagem(r);await env.VENDAS.put(k,JSON.stringify({...r,status:"pendente",recebido_em:new Date().toISOString()}));return k;}
async function atualizarMensagemNoKV(env,k,a){if(!env.VENDAS||!k)return;const atual=await env.VENDAS.get(k,{type:"json"})||{};await env.VENDAS.put(k,JSON.stringify({...atual,...a,atualizado_em:new Date().toISOString()}));}
async function aplicarParserNoKV(env,k,texto){const venda=parseVenda(texto);await atualizarMensagemNoKV(env,k,{venda,status:"pendente_revisao",parseado_em:new Date().toISOString()});return venda;}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==="GET"&&url.pathname==="/teste-venda"){
    if(url.searchParams.get("token")!==VERIFY_TOKEN)return new Response("Não autorizado",{status:403});
    const texto=url.searchParams.get("texto")||"";if(!texto)return Response.json({erro:"Informe ?texto="},{status:400});
    const venda=parseVenda(texto),key=`teste:${Date.now()}`;if(env.VENDAS)await env.VENDAS.put(key,JSON.stringify({tipo:"teste_parser",texto,venda,criado_em:new Date().toISOString()}),{expirationTtl:86400});
    return Response.json({ok:true,key,venda});
  }
  if(request.method==="GET"){
    const mode=url.searchParams.get("hub.mode"),token=url.searchParams.get("hub.verify_token"),challenge=url.searchParams.get("hub.challenge");
    if(mode==="subscribe"&&token===VERIFY_TOKEN)return new Response(challenge,{status:200,headers:{"Content-Type":"text/plain"}});
    return new Response("Token de verificação inválido",{status:403});
  }
  if(request.method==="POST"){
    try{
      const body=await request.json(),value=body?.entry?.[0]?.changes?.[0]?.value,message=value?.messages?.[0],contact=value?.contacts?.[0];
      if(message){
        const resumo={tipo:message.type||"desconhecido",remetente:message.from||contact?.wa_id||"desconhecido",nome:contact?.profile?.name||"",mensagem_id:message.id||"",texto:message.text?.body||"",audio_id:message.audio?.id||"",audio_mime_type:message.audio?.mime_type||"",audio_voz:message.audio?.voice===true};
        let kvKey=null;try{kvKey=await salvarMensagemNoKV(env,resumo);}catch(e){console.log(String(e));}
        if(message.type==="text"&&resumo.texto)try{await aplicarParserNoKV(env,kvKey,resumo.texto);}catch(e){console.log(String(e));}
        if(message.type==="audio"&&message.audio?.id){
          if(!env.META_ACCESS_TOKEN){try{await atualizarMensagemNoKV(env,kvKey,{status:"aguardando_token_meta"});}catch(e){}}
          else try{
            const info=await getWhatsAppMediaInfo(message.audio.id,env.META_ACCESS_TOKEN);if(info.url){const ab=await downloadWhatsAppMedia(info.url,env.META_ACCESS_TOKEN);await atualizarMensagemNoKV(env,kvKey,{status:"audio_baixado",audio_bytes:ab.byteLength,audio_mime_type:info.mime_type||message.audio?.mime_type||"",audio_file_size_meta:info.file_size||null,audio_baixado_em:new Date().toISOString()});
            try{await atualizarMensagemNoKV(env,kvKey,{status:"transcrevendo_audio"});const tx=await transcreverAudio(env,ab);await atualizarMensagemNoKV(env,kvKey,{status:"transcrito",texto:tx,transcricao:tx,modelo_transcricao:TRANSCRIBE_MODEL,transcrito_em:new Date().toISOString()});await aplicarParserNoKV(env,kvKey,tx);}catch(e){await atualizarMensagemNoKV(env,kvKey,{status:"erro_transcricao",erro_transcricao:String(e)});}}
          }catch(e){try{await atualizarMensagemNoKV(env,kvKey,{status:"erro_audio_meta",erro_audio:String(e)});}catch(_){}}
        }
      }
      return new Response("EVENT_RECEIVED",{status:200});
    }catch(e){console.log("Gelo Tutóia - erro no webhook:",String(e));return new Response("EVENT_RECEIVED",{status:200});}
  }
  return new Response("Webhook Gelo Tutóia ativo",{status:200});
}};
