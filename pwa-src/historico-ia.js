(()=>{
'use strict';

function escAI(v){
  return String(v||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});
}
function isoLocal(offset){
  offset=Number(offset)||0;
  const d=new Date();
  d.setDate(d.getDate()+offset);
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(d);
  const v=Object.fromEntries(parts.map(function(x){return [x.type,x.value]}));
  return v.year+'-'+v.month+'-'+v.day;
}
function brData(iso){
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?(m[3]+'/'+m[2]+'/'+m[1]):String(iso||'');
}

const css='.gt-ai-history-btn{grid-column:1/-1;background:linear-gradient(135deg,#6a35b8,#254b9b)!important;color:#fff!important}'
+'.gt-ai-history-wrap{padding:0 14px 24px}'
+'.gt-ai-history-card{background:rgba(19,43,65,.82);border:1px solid rgba(137,177,255,.28);border-radius:16px;padding:14px;margin:10px 0}'
+'.gt-ai-history-card label{display:block;font-size:12px;font-weight:900;letter-spacing:.06em;color:#9fc5e7;margin:10px 0 5px}'
+'.gt-ai-history-card input,.gt-ai-history-card textarea{box-sizing:border-box;width:100%;border:1px solid #34516f;background:#081826;color:#eef7ff;border-radius:12px;padding:12px;font:inherit}'
+'.gt-ai-history-card textarea{min-height:82px;resize:vertical}'
+'.gt-ai-history-quick{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}'
+'.gt-ai-history-quick button{border:1px solid #365978;background:#102b42;color:#eaf6ff;border-radius:10px;padding:10px 6px;font-weight:800}'
+'.gt-ai-history-result{white-space:pre-wrap;line-height:1.52;background:#071522;border:1px solid #314d66;border-radius:14px;padding:14px;min-height:90px;color:#edf7ff}'
+'.gt-ai-history-meta{font-size:12px;color:#90abc1;margin:7px 0 12px}';
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

function abrirTelaHistoricoIA(){
  if(typeof abrirSub!=='function')return;
  const hoje=isoLocal(0);
  const html=
    '<div class="pg-hdr"><div class="pg-title">🤖 HISTÓRICO IA</div><div class="pg-sub">WhatsApp por data</div></div>'
   +'<div class="gt-ai-history-wrap">'
   +'<div class="gt-ai-history-card">'
   +'<div style="font-size:13px;line-height:1.45;color:#b9d2e5">Escolha o dia ou escreva naturalmente. O GPT vai buscar todas as mensagens daquele dia e identificar automaticamente quem enviou.</div>'
   +'<label>DATA</label>'
   +'<input id="gt-ai-date" type="date" value="'+escAI(hoje)+'">'
   +'<div class="gt-ai-history-quick">'
   +'<button type="button" onclick="gtAISetDate(0)">Hoje</button>'
   +'<button type="button" onclick="gtAISetDate(-1)">Ontem</button>'
   +'<button type="button" onclick="gtAISetDate(-2)">Anteontem</button>'
   +'</div>'
   +'<label>PEDIDO</label>'
   +'<textarea id="gt-ai-pedido" placeholder="Ex.: Me mostra o histórico de hoje e faz o fechamento em bloco de notas."></textarea>'
   +'<button id="gt-ai-gerar" class="act-btn btn-rel" style="margin-top:12px" onclick="gtAIGerarRelatorio()">GERAR RELATÓRIO COM GPT</button>'
   +'</div>'
   +'<div class="gt-ai-history-card">'
   +'<div id="gt-ai-meta" class="gt-ai-history-meta">Nenhuma consulta feita ainda.</div>'
   +'<div id="gt-ai-result" class="gt-ai-history-result">O relatório vai aparecer aqui.</div>'
   +'<button id="gt-ai-copy" class="act-btn btn-back" style="margin-top:10px" onclick="gtAICopiar()" disabled>📋 COPIAR BLOCO DE NOTAS</button>'
   +'</div>'
   +'<button class="act-btn btn-back" onclick="fecharSub(false)">‹ Voltar</button>'
   +'</div>';
  abrirSub(html);
}

window.gtAISetDate=function(offset){
  const el=document.getElementById('gt-ai-date');
  if(el)el.value=isoLocal(offset);
};
window.gtAIGerarRelatorio=async function(){
  const api=window.GeloTutoiaGPT;
  const btn=document.getElementById('gt-ai-gerar');
  const out=document.getElementById('gt-ai-result');
  const meta=document.getElementById('gt-ai-meta');
  const copy=document.getElementById('gt-ai-copy');
  const date=(document.getElementById('gt-ai-date')||{}).value||isoLocal(0);
  const pedido=String((document.getElementById('gt-ai-pedido')||{}).value||'').trim();
  if(!api||typeof api.relatorioDia!=='function'){
    if(out)out.textContent='A ponte do GPT ainda não carregou. Feche e abra o app novamente.';
    return;
  }
  if(btn){btn.disabled=true;btn.textContent='⏳ ANALISANDO WHATSAPP...'}
  if(copy)copy.disabled=true;
  if(out)out.textContent='Buscando mensagens e preparando o relatório...';
  if(meta)meta.textContent='Consultando '+brData(date)+'...';
  try{
    const r=await api.relatorioDia(date,pedido);
    const h=r&&r.historico?r.historico:{};
    const pessoas=Array.isArray(h.pessoas)&&h.pessoas.length?h.pessoas.join(', '):'nenhum remetente identificado';
    const qtd=Number(h.mensagens_historico||0);
    if(meta)meta.textContent=brData(h.data||date)+' · '+qtd+' mensagem(ns) · '+pessoas;
    if(out)out.textContent=String(r&&r.reply?r.reply:'O GPT não retornou texto.');
    if(copy)copy.disabled=!String(r&&r.reply?r.reply:'').trim();
  }catch(e){
    if(meta)meta.textContent='Falha na consulta.';
    if(out)out.textContent='Não consegui gerar o relatório agora. '+String(e&&e.message?e.message:e);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='GERAR RELATÓRIO COM GPT'}
  }
};
window.gtAICopiar=async function(){
  const el=document.getElementById('gt-ai-result');
  const text=String(el?el.textContent:'').trim();
  if(!text)return;
  try{
    await navigator.clipboard.writeText(text);
    if(typeof toast==='function')toast('✓ Relatório copiado');
  }catch(e){
    if(typeof toast==='function')toast('⚠ Não consegui copiar automaticamente');
  }
};
window.telaHistoricoIA=abrirTelaHistoricoIA;

function instalarBotao(){
  const grid=document.querySelector('.quick-grid');
  if(!grid||grid.querySelector('.gt-ai-history-btn'))return;
  const b=document.createElement('button');
  b.type='button';
  b.className='quick-btn gt-ai-history-btn';
  b.innerHTML='<span class="qi">🤖</span> HISTÓRICO IA';
  b.addEventListener('click',abrirTelaHistoricoIA);
  grid.prepend(b);
}

instalarBotao();
const anterior=telaClientes;
telaClientes=function(){
  const r=anterior.apply(this,arguments);
  setTimeout(instalarBotao,0);
  return r;
};
})();