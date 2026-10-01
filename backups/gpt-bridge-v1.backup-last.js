(()=>{
'use strict';

const TURBO='https://turbo-engine-production.up.railway.app';
const TOKEN_KEY='geloTutoia.turboToken.v1';
const SESSION_KEY='geloTutoia.gptSession.v1';
let loginPromise=null;

function injectLogin(){
  if(document.getElementById('geloTurboLogin'))return;
  const style=document.createElement('style');
  style.textContent=`
  .geloTurboLogin{position:fixed;inset:0;z-index:99999;display:none;place-items:center;padding:18px;background:rgba(3,8,15,.78);backdrop-filter:blur(9px)}
  .geloTurboLogin.open{display:grid}
  .geloTurboCard{width:min(100%,390px);border:1px solid rgba(120,180,255,.28);background:#0b1728;color:#eef6ff;border-radius:20px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.45)}
  .geloTurboCard h3{margin:0 0 6px}.geloTurboCard p{margin:0 0 14px;color:#9fb2ca;font-size:13px;line-height:1.45}
  .geloTurboCard input{box-sizing:border-box;width:100%;margin:0 0 9px;border:1px solid #29415f;background:#07111e;color:#fff;border-radius:12px;padding:12px 13px;font:inherit}
  .geloTurboActions{display:flex;gap:8px;justify-content:flex-end;margin-top:7px}
  .geloTurboActions button{border:1px solid #29415f;border-radius:11px;padding:10px 13px;font-weight:800}
  .geloTurboCancel{background:#101d2f;color:#e7f1ff}.geloTurboEnter{background:#2586d4;color:#fff}
  .geloTurboError{min-height:18px;margin-top:7px;color:#ff8698;font-size:12px}
  `;
  document.head.appendChild(style);

  const wrap=document.createElement('div');
  wrap.id='geloTurboLogin';
  wrap.className='geloTurboLogin';
  wrap.innerHTML=`
    <div class="geloTurboCard">
      <h3>Entrar no GPT do Gelo Tutóia</h3>
      <p>Use o mesmo acesso do Cláudio Turbo Agent. A senha não fica salva no app.</p>
      <input id="geloTurboUser" autocomplete="username" value="claudio" placeholder="Usuário">
      <input id="geloTurboPass" type="password" autocomplete="current-password" placeholder="Senha do Turbo">
      <div id="geloTurboError" class="geloTurboError"></div>
      <div class="geloTurboActions">
        <button type="button" class="geloTurboCancel" id="geloTurboCancel">Cancelar</button>
        <button type="button" class="geloTurboEnter" id="geloTurboEnter">Entrar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

function login(){
  if(loginPromise)return loginPromise;
  injectLogin();
  const wrap=document.getElementById('geloTurboLogin');
  const user=document.getElementById('geloTurboUser');
  const pass=document.getElementById('geloTurboPass');
  const error=document.getElementById('geloTurboError');
  const enter=document.getElementById('geloTurboEnter');
  const cancel=document.getElementById('geloTurboCancel');

  wrap.classList.add('open');
  error.textContent='';
  setTimeout(()=>pass.focus(),50);

  loginPromise=new Promise((resolve,reject)=>{
    const cleanup=()=>{
      enter.onclick=null;cancel.onclick=null;pass.onkeydown=null;
      wrap.classList.remove('open');
      loginPromise=null;
    };
    const submit=async()=>{
      error.textContent='';
      enter.disabled=true;
      enter.textContent='Entrando...';
      try{
        const r=await fetch(TURBO+'/__turbo/panel-login',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({username:user.value.trim(),password:pass.value})
        });
        const d=await r.json().catch(()=>({}));
        if(!r.ok||!d.ok||!d.token)throw new Error(d.error||'Não foi possível entrar.');
        localStorage.setItem(TOKEN_KEY,d.token);
        pass.value='';
        cleanup();
        resolve(d.token);
      }catch(e){
        error.textContent=e?.message||String(e);
      }finally{
        enter.disabled=false;
        enter.textContent='Entrar';
      }
    };
    enter.onclick=submit;
    cancel.onclick=()=>{cleanup();reject(new Error('Login cancelado.'));};
    pass.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit();}};
  });
  return loginPromise;
}

async function token(){
  return localStorage.getItem(TOKEN_KEY)||login();
}

function buildPrompt(payload={}){
  const message=String(payload.message||payload.pergunta||'').trim();
  const contexto=payload.contexto||payload.context||null;
  const linhas=[
    'Você é o agente operacional interno do aplicativo Gelo Tutóia.',
    'As mensagens analisadas são registros internos de vendas enviados por Cláudio, Tafarel e Maíra. NÃO trate essas mensagens como atendimento ao cliente e NÃO faça perguntas de endereço, horário, confirmação de pedido ou finalização.',
    'Extraia somente o que interessa para a venda: cliente ou apelido do ponto, quantidade, pagamento e tipo/tamanho de gelo apenas quando isso realmente estiver explícito ou for necessário.',
    'Se o cadastro do sistema já associa o cliente a um produto/preço, não exija que o ajudante repita o tipo de gelo. Exemplo: uma fala longa como "o Marcelo estava fechado, deixei dois no freezer, foi Pix" deve ser resumida como Marcelo — 2 — PIX.',
    'Considere apelidos diferentes como possíveis nomes do mesmo ponto quando os dados do sistema indicarem isso. Nunca crie um novo cliente só porque o ajudante usou outro apelido.',
    'Ignore detalhes operacionais sem efeito financeiro, como portão, freezer, barraca fechada, localização física ou conversa paralela.',
    'Nunca invente venda, quantidade, pagamento, cliente ou entrega.',
    'Quando houver dúvida relevante, marque como precisa de confirmação; não interrogue o ajudante.',
    'Uma visita não concluída não é venda; uma venda concluída exige indicação de entrega/saída efetiva.',
    'Quando solicitado relatório, responda como bloco de notas, em ordem cronológica, e some quantidades/valores apenas quando os dados permitirem.',
    contexto?'DADOS DO SISTEMA:\n'+JSON.stringify(contexto):'',
    'PEDIDO DO USUÁRIO:\n'+message
  ].filter(Boolean);
  return linhas.join('\n\n');
}

async function ask(payload={},retry=true){
  const auth=await token();
  const prompt=buildPrompt(payload);
  const r=await fetch(TURBO+'/__turbo/chat',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'authorization':'Bearer '+auth
    },
    body:JSON.stringify({
      sessionId:localStorage.getItem(SESSION_KEY)||null,
      project:{key:'gelo-tutoia',name:'Gelo Tutóia',repo:'claudio41cg-max/gelo-tutoia-whatsapp'},
      message:prompt
    })
  });
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&retry){
    localStorage.removeItem(TOKEN_KEY);
    return ask(payload,false);
  }
  if(!r.ok||!d.ok)throw new Error(d.error||'GPT indisponível.');
  if(d.sessionId)localStorage.setItem(SESSION_KEY,d.sessionId);
  return {
    reply:String(d.reply||'').trim(),
    sessionId:d.sessionId||localStorage.getItem(SESSION_KEY)||null,
    provider:'GPT via Turbo'
  };
}

function dataLocalISO(d=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(d);
  const v=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

function resolverFaixaHorario(texto=''){
  const t=String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/\b(meio[- ]?dia|12\s*h(?:oras?)?)\b/.test(t)&&/\b(8|08)\s*h?(?:oras?)?\b/.test(t))return {inicio:'08:00:00',fim:'12:00:00'};
  const m=t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:h|horas?)?\s*(?:ate|a|as|às|-)\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|horas?)?\b/);
  if(!m)return null;
  const h1=Math.max(0,Math.min(23,Number(m[1]))),m1=Math.max(0,Math.min(59,Number(m[2]||0)));
  const h2=Math.max(0,Math.min(23,Number(m[3]))),m2=Math.max(0,Math.min(59,Number(m[4]||0)));
  return {inicio:String(h1).padStart(2,'0')+':'+String(m1).padStart(2,'0')+':00',fim:String(h2).padStart(2,'0')+':'+String(m2).padStart(2,'0')+':59'};
}
function horaLocalISO(iso=''){
  const d=new Date(iso); if(Number.isNaN(d.getTime()))return '';
  const p=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d);
  const v=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return (v.hour||'00')+':'+(v.minute||'00')+':'+(v.second||'00');
}
function filtrarFaixa(arr,faixa,campo){
  if(!faixa||!Array.isArray(arr))return Array.isArray(arr)?arr:[];
  return arr.filter(x=>{
    const h=horaLocalISO(x&&x[campo]);
    return h&&h>=faixa.inicio&&h<=faixa.fim;
  });
}

function resolverDataPedido(texto=''){
  const t=String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const now=new Date();
  const shift=days=>{
    const d=new Date(now.getTime());
    d.setDate(d.getDate()-days);
    return dataLocalISO(d);
  };
  if(/\banteontem\b/.test(t))return shift(2);
  if(/\bontem\b/.test(t))return shift(1);
  if(/\bhoje\b/.test(t))return shift(0);
  const dias=t.match(/\b(\d{1,3})\s+dias?\s+(?:atras|atrás)\b/);
  if(dias)return shift(Math.max(0,Math.min(365,Number(dias[1])||0)));
  const iso=t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br=t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if(br)return `${br[3]}-${String(br[2]).padStart(2,'0')}-${String(br[1]).padStart(2,'0')}`;
  return shift(0);
}

async function historicoDia(data='',retry=true){
  const auth=await token();
  const qs=new URLSearchParams();
  if(data)qs.set('data',String(data).trim());
  const r=await fetch(TURBO+'/__turbo/gelo-history?'+qs.toString(),{
    method:'GET',
    headers:{'authorization':'Bearer '+auth,'accept':'application/json'},
    cache:'no-store'
  });
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&retry){
    localStorage.removeItem(TOKEN_KEY);
    return historicoDia(data,false);
  }
  if(!r.ok||!d?.ok)throw new Error(d?.error||'Não consegui ler o histórico do dia.');
  return d;
}

async function relatorioDia(data='',pedido=''){
  const historico=await historicoDia(data);
  const faixa=resolverFaixaHorario(pedido);
  const mensagens=filtrarFaixa(Array.isArray(historico.mensagens)?historico.mensagens:[],faixa,'recebido_em');
  const vendas=filtrarFaixa(Array.isArray(historico.vendas)?historico.vendas:[],faixa,'recebido_em');
  const faixaTexto=faixa?(' Considere somente o intervalo '+faixa.inicio.slice(0,5)+'–'+faixa.fim.slice(0,5)+'.'):'';
  const mensagem=String(pedido||'').trim()||
    ('Analise os registros internos de venda deste dia.'+faixaTexto+' Para cada venda, reduza falas longas ao essencial: cliente, quantidade, pagamento e produto somente quando necessário. Não faça perguntas de atendimento. Gere um relatório curto em formato de bloco de notas, em ordem cronológica, com totais quando os dados permitirem. Não invente nada.');
  const contexto={
    data:String(historico.data||data||''),
    faixa:faixa||null,
    pessoas:Array.isArray(historico.pessoas)?historico.pessoas:[],
    mensagens,
    vendas,
    mensagens_historico:mensagens.length
  };
  const resultado=await ask({message:mensagem,contexto});
  return {...resultado,historico:{...historico,mensagens,vendas,mensagens_historico:mensagens.length,faixa}};
}

async function relatorioPorPedido(pedido=''){
  const data=resolverDataPedido(pedido);
  return relatorioDia(data,pedido);
}

async function historicoPessoa(helper,data='',retry=true){
  const auth=await token();
  const qs=new URLSearchParams({helper:String(helper||'').trim()});
  if(data)qs.set('data',String(data).trim());
  const r=await fetch(TURBO+'/__turbo/gelo-history?'+qs.toString(),{
    method:'GET',
    headers:{'authorization':'Bearer '+auth,'accept':'application/json'},
    cache:'no-store'
  });
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&retry){
    localStorage.removeItem(TOKEN_KEY);
    return historicoPessoa(helper,data,false);
  }
  if(!r.ok||!d?.ok)throw new Error(d?.error||'Não consegui ler o histórico do WhatsApp.');
  return d;
}

async function relatorioPessoa(helper,data='',pedido=''){
  const historico=await historicoPessoa(helper,data);
  const mensagem=String(pedido||'').trim()||
    'Analise todas as mensagens deste dia. Separe vendas concluídas, avisos, tentativas não concluídas, correções e conversa comum. Depois gere um relatório curto em formato de bloco de notas, em ordem cronológica, com totais quando houver dados suficientes. Não invente nada.';
  const contexto={
    pessoa:String(historico.helper||helper||''),
    data:String(historico.data||data||''),
    vendas:Array.isArray(historico.vendas)?historico.vendas:[],
    mensagens_historico:Number(historico.mensagens_historico||0),
    mensagens_sem_venda:Array.isArray(historico.mensagens_sem_venda)?historico.mensagens_sem_venda:[]
  };
  const resultado=await ask({message:mensagem,contexto});
  return {...resultado,historico};
}

window.GeloTutoiaGPT={
  ask,
  auth:token,
  resolverDataPedido,
  resolverFaixaHorario,
  historicoDia,
  relatorioDia,
  relatorioPorPedido,
  historicoPessoa,
  relatorioPessoa,
  reset(){localStorage.removeItem(SESSION_KEY);},
  logout(){
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
  },
  base:TURBO
};
})();
