/* Integra mensagens verificadas do WhatsApp ao movimento do dia. */
(()=>{
  const syncAnterior=sincronizarInboxRemoto;
  const PANEL_INBOX_API='https://painel-clientes-production.up.railway.app/api/gelo/inbox';
  const PANEL_LOCAL_FEED='https://painel-clientes-production.up.railway.app/api/gelo/inbox-local';
  const PANEL_RESET_DAY='https://painel-clientes-production.up.railway.app/api/gelo/reset-day';
  const PANEL_IGNORE_SALE='https://painel-clientes-production.up.railway.app/api/gelo/ignore-sale';
  const PANEL_QUEUE_STATUS='https://painel-clientes-production.up.railway.app/api/gelo/queue/status';
  let gtSyncGeneration=0;
  let gtResetEmAndamento=false;
  const GT_RESET_CUTOFF_KEY='gelo_tutoia_reset_cutoff_v1';
  const GT_IGNORED_REMOTE_IDS_KEY='gelo_tutoia_ignored_remote_ids_v1';
  function idsIgnorados(){
    try{return new Set(JSON.parse(localStorage.getItem(GT_IGNORED_REMOTE_IDS_KEY)||'[]').map(String))}catch{return new Set()}
  }
  function salvarIdsIgnorados(set){
    try{localStorage.setItem(GT_IGNORED_REMOTE_IDS_KEY,JSON.stringify([...set].slice(-4000)))}catch(e){}
  }
  function ignorarIdsAtuais(){
    const set=idsIgnorados();
    for(const v of vendasRecebidas||[])if(v?.remoteId)set.add(String(v.remoteId));
    for(const lista of Object.values(S?.vpc||{}))for(const v of Array.isArray(lista)?lista:[])if(v?.remoteId)set.add(String(v.remoteId));
    salvarIdsIgnorados(set);
  }
  function removerIdsIgnorados(){
    const set=idsIgnorados();if(!set.size)return;
    let mudou=false;
    for(let i=vendasRecebidas.length-1;i>=0;i--){
      if(set.has(String(vendasRecebidas[i]?.remoteId||''))){vendasRecebidas.splice(i,1);mudou=true}
    }
    if(mudou)salvarInbox();
  }
  function resetCutoff(){const n=Number(localStorage.getItem(GT_RESET_CUTOFF_KEY)||0);return Number.isFinite(n)?n:0}
  function antesDoCorte(iso){const t=new Date(iso||0).getTime();return !!t&&t<=resetCutoff()}
  function limparAntesDoCorte(){
    const corte=resetCutoff();if(!corte)return;
    let mudou=false;
    for(let i=vendasRecebidas.length-1;i>=0;i--){
      const t=new Date(vendasRecebidas[i]?.criadoEm||0).getTime();
      if(t&&t<=corte){vendasRecebidas.splice(i,1);mudou=true}
    }
    if(mudou)salvarInbox();
  }
  const GT_RESET_EVENT_KEY='gelo_tutoia_reset_event_v1';
  window.reiniciarTudo=function(){
    if(gtResetEmAndamento)return toast('Aguarde, o dia já está sendo reiniciado');
    confirmar('Reiniciar o dia?','Todos os dados do movimento do dia serão zerados. O histórico do WhatsApp continuará guardado, mas não será relançado. O Caderno permanece salvo.','Sim, reiniciar',async()=>{
      if(gtResetEmAndamento)return;
      gtResetEmAndamento=true;
      gtSyncGeneration++;
      const btn=[...document.querySelectorAll('.btn-reset')].find(b=>/REINICIAR TUDO/i.test(String(b.textContent||'')));
      if(btn)btn.disabled=true;
      try{
        let resposta;
        try{
          const rr=await fetch(PANEL_RESET_DAY+'?ts='+Date.now(),{method:'POST',cache:'no-store'});
          resposta=await rr.json().catch(()=>({}));
          if(!rr.ok||!(Number(resposta?.cutoff)>0))throw new Error('HTTP '+rr.status);
        }catch(e){
          console.warn('Falha ao arquivar fila no servidor',e);
          return toast('⚠ Não consegui reiniciar agora');
        }
        const cutoff=Number(resposta.cutoff);
        ignorarIdsAtuais();
        localStorage.setItem(GT_RESET_CUTOFF_KEY,String(cutoff));
        limparAntesDoCorte();
        vendasRecebidas.splice(0,vendasRecebidas.length);
        salvarInbox();
        S={esc:0,filt:0,caixa:0,pix:0,din:0,desp:0,fiad:0,vpc:{},despDia:[],atendidos:new Set(),ultima:null,qtd:1};
        salvarEstado();salvarDiaNoHistorico();updHdr();telaClientes();
        localStorage.setItem(GT_RESET_EVENT_KEY,JSON.stringify({cutoff,at:Date.now()}));
        toast('✓ Novo dia!');
      }finally{
        gtResetEmAndamento=false;
        if(btn)btn.disabled=false;
      }
    });
  };
  window.addEventListener('storage',e=>{
    if(e.key!==GT_RESET_EVENT_KEY||!e.newValue)return;
    gtSyncGeneration++;
    gtResetEmAndamento=true;
    window.location.reload();
  });
  const lancarAnterior=lancarRecebidaNoDia;
  const confirmarAnterior=confirmarVendaRecebida;
  let statusAtivo=null,pendencias=[];
  function mostrarStatus(){
    const inicio=document.querySelector('.quick-grid');if(!inicio)return;
    let aviso=inicio.querySelector('.gt-wa-status');
    if(!aviso){aviso=document.createElement('div');aviso.className='gt-wa-status';aviso.style.cssText='grid-column:1/-1;padding:9px 12px;border-radius:10px;background:#12354f;color:#e8f5ff;font-size:13px;text-align:center';inicio.appendChild(aviso)}
    aviso.textContent=statusAtivo===true?'✓ WhatsApp automático ligado':statusAtivo===false?'⚠ WhatsApp automático aguarda: '+(pendencias.join(' e ')||'configuração do servidor'):'Conferindo WhatsApp automático...';
  }
  async function checarStatus(){
    try{const r=await fetch(INBOX_API+'/api/auto-status',{cache:'no-store'});const d=await r.json();statusAtivo=r.ok&&d.auto_configurado===true;pendencias=[];if(d.assinatura_configurada===false)pendencias.push('assinatura Meta');if(d.remetentes_configurados===false)pendencias.push('números autorizados')}
    catch(e){statusAtivo=null}
    mostrarStatus();
  }
  mostrarStatus();checarStatus();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sincronizarInboxRemoto(false)});
  confirmarVendaRecebida=function(id){
    const v=vendasRecebidas.find(x=>String(x.id)===String(id));
    if(!v||v.status!=='Pendente')return;
    if(v.confianca==='revisar'){
      const qtd=Number(window.prompt('Confira a quantidade de sacos:',String(v.qtd)));
      if(!Number.isInteger(qtd)||qtd<1||qtd>200)return toast('⚠ Quantidade não confirmada');
      const tipo=String(window.prompt('Produto: escamas ou filtrado?',v.tipo==='esc'?'escamas':'filtrado')||'').toLowerCase().trim();
      if(!['escamas','filtrado'].includes(tipo))return toast('⚠ Produto não confirmado');
      v.qtd=qtd;v.tipo=tipo==='escamas'?'esc':'filt';v.preco=precoVendaRemota(v.cliente,v.tipo);v.valor=v.qtd*v.preco;
      v.confianca='corrigida';
    }
    if(!['PIX','Dinheiro','Fiado'].includes(v.pag)){
      const pag=String(window.prompt('Pagamento: PIX, Dinheiro ou Fiado?','')||'').toLowerCase().trim();
      const opcoes={pix:'PIX',dinheiro:'Dinheiro',fiado:'Fiado'};
      if(!opcoes[pag])return toast('⚠ Pagamento não informado');
      v.pag=opcoes[pag];
    }
    salvarInbox();confirmarAnterior(id);
  };
  lancarRecebidaNoDia=function(v){
    lancarAnterior(v);
    if(v.remoteId){
      const lista=S.vpc[v.cliente]||[];
      if(lista.length){lista[lista.length-1].remoteId=v.remoteId;lista[lista.length-1].remoteKey=v.remoteKey}
    }
  };
  function jaLancada(id){return Object.values(S.vpc||{}).some(lista=>Array.isArray(lista)&&lista.some(v=>v.remoteId===id));}
  function hoje(iso){const data=new Date(iso);return !Number.isNaN(data.getTime())&&data.toLocaleDateString('pt-BR')===new Date().toLocaleDateString('pt-BR');}
  function lancarSemPagamento(v){
    const item={tipo:v.tipo,qtd:v.qtd,pag:'Não informado',preco:v.preco,valor:v.valor,hora:v.hora||horaAgora(),origem:'WhatsApp automático',remoteId:v.remoteId,remoteKey:v.remoteKey,iaRevisar:v.confianca==='revisar'};
    if(!S.vpc[v.cliente])S.vpc[v.cliente]=[];S.vpc[v.cliente].push(item);
    if(v.tipo==='esc')S.esc+=Number(v.qtd)||0;else if(v.tipo==='filt')S.filt+=Number(v.qtd)||0;S.atendidos.add(v.cliente);
  }
  function vendaLocalValida(v){const texto=String(v?.transcricao||v?.texto||v?.texto_origem||'');const soLink=/^\s*(https?:\/\/|www\.)/i.test(texto);return !soLink&&CLIENTES.includes(v?.cliente)&&Number.isInteger(v?.qtd)&&v.qtd>=1&&v.qtd<=200&&['esc','filt'].includes(v?.tipo)&&Number.isFinite(v?.valor)&&v.valor>0;}
  function limparFalsosPositivosLocais(){
    const antes=vendasRecebidas.length;
    for(let i=vendasRecebidas.length-1;i>=0;i--){const v=vendasRecebidas[i];if(v?.status==='Pendente'&&!vendaLocalValida(v))vendasRecebidas.splice(i,1);}
    if(vendasRecebidas.length!==antes)salvarInbox();
  }
  function integrar(){
    limparFalsosPositivosLocais();let total=0,alterou=false,revisar=0;
    for(const v of vendasRecebidas){
      if(v.status!=='Pendente'||!v.remoteId||!hoje(v.criadoEm))continue;if(!vendaLocalValida(v))continue;
      if(!jaLancada(v.remoteId)){if(['PIX','Dinheiro','Fiado'].includes(v.pag))lancarRecebidaNoDia(v);else lancarSemPagamento(v);total++;if(v.confianca==='revisar'||!['PIX','Dinheiro','Fiado'].includes(v.pag))revisar++;}
      v.status='Confirmada';v.origem='WhatsApp automático';v.syncRemoto='ok';alterou=true;
      fetch(PANEL_QUEUE_STATUS,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({remote_id:String(v.remoteId),status:'launched'}),cache:'no-store'}).catch(e=>console.warn('Falha ao marcar venda como lançada no servidor',e));
    }
    if(alterou){salvarEstado();salvarDiaNoHistorico();salvarInbox();updHdr();try{telaClientes(true)}catch(e){console.log('Gelo Tutóia - falha ao atualizar tela principal:',e)}if(total)toast(`✓ ${total} venda${total>1?'s':''} do WhatsApp lançada${total>1?'s':''} automaticamente${revisar?' · '+revisar+' para revisar':''}`);}
    return total;
  }
  atualizarVendasWhatsApp=async function(){return sincronizarInboxRemoto(false);};
  function recalcularMovimentoDoDia(){
    let esc=0,filt=0,pix=0,din=0,fiad=0;
    for(const lista of Object.values(S.vpc||{}))for(const v of Array.isArray(lista)?lista:[]){if(v.tipo==='obs')continue;const q=Number(v.qtd)||0,val=Number(v.valor)||0;if(v.tipo==='esc')esc+=q;else if(v.tipo==='filt')filt+=q;if(v.pag==='PIX')pix+=val;else if(v.pag==='Fiado')fiad+=val;else if(v.pag==='Dinheiro')din+=val;}
    S.esc=esc;S.filt=filt;S.pix=pix;S.din=din;S.fiad=fiad;S.caixa=pix+din;S.atendidos=new Set(Object.keys(S.vpc||{}).filter(n=>(S.vpc[n]||[]).some(v=>v.tipo!=='obs')));salvarEstado();salvarDiaNoHistorico();updHdr();
  }
  window.excluirVendaRecebida=function(id){
    const i=vendasRecebidas.findIndex(x=>String(x.id)===String(id));if(i<0)return;const v=vendasRecebidas[i];
    confirmar('Excluir este registro?','A venda será removida do movimento e não voltará a ser lançada automaticamente. O histórico bruto do WhatsApp continua guardado para o GPT.','Sim, excluir',async()=>{
      const set=idsIgnorados();if(v.remoteId)set.add(String(v.remoteId));salvarIdsIgnorados(set);
      if(v.remoteId){try{await fetch(PANEL_QUEUE_STATUS,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({remote_id:String(v.remoteId),status:'deleted'}),cache:'no-store'});}catch(e){console.warn('Falha ao persistir exclusão da venda no Railway',e)}}
      if(v.remoteId&&S.vpc?.[v.cliente])S.vpc[v.cliente]=S.vpc[v.cliente].filter(x=>x.remoteId!==v.remoteId);
      vendasRecebidas.splice(i,1);salvarInbox();recalcularMovimentoDoDia();toast('🗑 Venda excluída');telaVendasRecebidas('Confirmada');
    });
  };
  telaVendasRecebidas=function(filtro='Confirmada'){
    if(filtro==='Pendente')filtro='Confirmada';sincronizarInboxRemoto(false).catch(()=>{});
    const lista=vendasRecebidas.filter(v=>v.status===filtro),conf=vendasRecebidas.filter(v=>v.status==='Confirmada').length,ign=vendasRecebidas.filter(v=>v.status==='Ignorada').length;
    let h=`<div class="pg-hdr"><div class="pg-title">💬 VENDAS RECEBIDAS</div><div class="pg-sub">Histórico das vendas do WhatsApp</div></div><div style="margin:0 14px 10px;padding:10px 12px;border-radius:12px;background:#12354f;color:#dff4ff;font-size:12px;text-align:center">✓ Sincronização automática ativa</div><div class="tabs3" style="grid-template-columns:1fr 1fr"><button class="tab3 ${filtro==='Confirmada'?'active':''}" onclick="telaVendasRecebidas('Confirmada')">Confirmadas ${conf}</button><button class="tab3 ${filtro==='Ignorada'?'active':''}" onclick="telaVendasRecebidas('Ignorada')">Ignoradas ${ign}</button></div>`;
    if(!lista.length)h+='<div class="empty">Nenhuma venda nesta área.</div>';
    lista.slice().reverse().forEach(v=>{h+=`<div class="inbox-card"><div class="inbox-top"><b>🕒 ${escHtml(v.hora||'')}</b><span class="status-pill st-${String(v.status).toLowerCase()}">${v.status}</span></div><div style="font-size:11px;color:#1689ff;font-weight:800;margin-bottom:4px">${escHtml(v.origem||'WhatsApp')}${v.confianca?` · IA: ${escHtml(v.confianca)}`:''}</div><div style="font-size:13px;color:#536b7b;margin-bottom:7px">"${escHtml(v.transcricao||'')}"</div><div style="font-weight:900">${escHtml(v.cliente||'')}</div><div>${Number(v.qtd)||0}x ${v.tipo==='esc'?'Escamas':'Filtrado'} · <b>${escHtml(v.pag||'Não informado')}</b> · ${fmt(Number(v.valor)||0)}</div><div class="inbox-actions"><button class="mini-btn mini-no" onclick="excluirVendaRecebida('${v.id}')">🗑 Excluir</button></div></div>`;});
    h+='<button class="act-btn btn-back" onclick="fecharSub(false)">‹ Voltar</button>';abrirSub(h);atualizarBadgeInbox();
  };
  let syncRapidoEmAndamento=false;
  setTimeout(()=>{try{limparFalsosPositivosLocais();sincronizarInboxRemoto(false)}catch(e){}},150);setTimeout(()=>{try{sincronizarInboxRemoto(false)}catch(e){}},1800);
  function clienteDinamicoNoTexto(texto){const n=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();const t=' '+n(texto)+' ',nomes=(CLIENTES||[]).slice().sort((a,b)=>n(b).length-n(a).length);for(const nome of nomes){const nn=n(nome);if(nn&&t.includes(' '+nn+' '))return nome;}return '';}
  async function sincronizarViaHistoricoLocal(mostrarAviso){
    try{
      const corte=resetCutoff(),r=await fetch(PANEL_LOCAL_FEED+'?after='+encodeURIComponent(corte)+'&ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();if(Number(d?.server_cutoff)>resetCutoff())localStorage.setItem(GT_RESET_CUTOFF_KEY,String(Number(d.server_cutoff)));const mensagens=Array.isArray(d?.mensagens)?d.mensagens:[];let novas=0,ignoradas=0;
      for(const m of mensagens){const msgMs=Number(m?.timestamp_ms||0)||new Date(m?.timestamp||0).getTime();if(resetCutoff()&&(!msgMs||msgMs<=resetCutoff()))continue;const texto=String(m?.texto||'').trim();if(!texto)continue;let vendas=typeof interpretarLinhaVenda==='function'?interpretarLinhaVenda(texto):[];if((!Array.isArray(vendas)||!vendas.some(v=>v?.ok))&&clienteDinamicoNoTexto(texto)){const cli=clienteDinamicoNoTexto(texto),nt=String(texto).toLowerCase(),qm=nt.match(/\b(\d{1,3})\s*(?:saco|sacos)?\b/),qtd=qm?Number(qm[1]):0,tipo=/filtrad/.test(nt)?'filt':/escam/.test(nt)?'esc':'',pag=/\bpix\b/.test(nt)?'PIX':/\b(fiando|fiado)\b/.test(nt)?'Fiado':/\b(pago|pagou|dinheiro)\b/.test(nt)?'Dinheiro':'Não informado';if(cli&&qtd>0&&tipo){const preco=precoVendaRemota(cli,tipo);vendas=[{ok:true,cliente:cli,qtd,tipo,pag,preco,valor:qtd*preco}];}}
        let idx=0;for(const v of vendas){if(!v?.ok){ignoradas++;continue}const remoteId='railway-'+String(m?.message_id||m?.timestamp||Date.now())+'-'+(idx++);if(idsIgnorados().has(remoteId)||vendasRecebidas.some(x=>String(x?.remoteId||'')===remoteId))continue;const criadoEm=String(m?.timestamp||new Date().toISOString());vendasRecebidas.push({id:'remoto-'+remoteId,remoteId,remoteKey:'',sourceMessageId:String(m?.message_id||''),criadoEm,hora:horaDaDataIso(criadoEm),origem:'WhatsApp automático',transcricao:texto,cliente:v.cliente,qtd:Number(v.qtd)||0,tipo:v.tipo,pag:v.pag,preco:Number(v.preco)||precoVendaRemota(v.cliente,v.tipo),valor:Number(v.valor)||((Number(v.qtd)||0)*precoVendaRemota(v.cliente,v.tipo)),status:'Pendente',confianca:'alta',syncRemoto:'local'});novas++;}}
      if(novas)salvarInbox();atualizarBadgeInbox();return {ok:true,novas,ignoradas,via:'railway-local'};
    }catch(e){console.warn('Falha no histórico local do Railway',e);if(mostrarAviso)toast('⚠ Não consegui buscar vendas agora');return {ok:false,erro:String(e),via:'railway-local'};}
  }
  async function sincronizarViaPainel(mostrarAviso,minhaGeracao){
    try{
      const r=await fetch(PANEL_INBOX_API+'?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();if(minhaGeracao!==gtSyncGeneration||gtResetEmAndamento)return {ok:false,reset:true,via:'painel'};if(Number(d?.server_cutoff)>resetCutoff())localStorage.setItem(GT_RESET_CUTOFF_KEY,String(Number(d.server_cutoff)));const lista=Array.isArray(d?.vendas)?d.vendas:[];let novas=0,ignoradas=0;
      for(const x of lista){const remoteId=String(x?.remote_id||''),recebidoMs=Number(x?.timestamp_ms||0)||new Date(x?.recebido_em||0).getTime();if(resetCutoff()&&(!recebidoMs||recebidoMs<=resetCutoff()))continue;if(!remoteId||vendasRecebidas.some(v=>String(v?.remoteId||'')===remoteId))continue;const cliente=String(x?.cliente||''),tipo=x?.tipo==='filt'?'filt':'esc',qtd=Number(x?.qtd)||0,pag=['Dinheiro','PIX','Fiado'].includes(x?.pagamento)?x.pagamento:'Não informado';if(!CLIENTES.includes(cliente)||!Number.isInteger(qtd)||qtd<1||qtd>200){ignoradas++;continue}const preco=precoVendaRemota(cliente,tipo);vendasRecebidas.push({id:'remoto-'+remoteId,remoteId,remoteKey:String(x?.remote_key||''),sourceMessageId:String(x?.message_id||''),criadoEm:x?.recebido_em||new Date().toISOString(),hora:horaDaDataIso(x?.recebido_em),origem:'WhatsApp automático',transcricao:String(x?.transcricao||''),cliente,qtd,tipo,pag,preco,valor:preco*qtd,status:'Pendente',confianca:x?.confianca||'revisar',syncRemoto:'ok'});novas++;}
      if(novas)salvarInbox();atualizarBadgeInbox();if(mostrarAviso&&!novas&&!ignoradas)toast('✓ WhatsApp atualizado');return {ok:true,novas,ignoradas,via:'painel'};
    }catch(e){console.warn('Falha também no caminho reserva do painel',e);if(mostrarAviso)toast('⚠ Não consegui buscar vendas agora');return {ok:false,erro:String(e),via:'painel'};}
  }
  sincronizarInboxRemoto=async function(mostrarAviso=true){
    if(syncRapidoEmAndamento||gtResetEmAndamento)return {ok:false,ocupado:true};syncRapidoEmAndamento=true;const minhaGeracao=gtSyncGeneration;
    try{const resultado=await sincronizarViaPainel(mostrarAviso,minhaGeracao);if(resultado?.reset)return resultado;if(resultado?.ok){if(minhaGeracao!==gtSyncGeneration||gtResetEmAndamento){limparAntesDoCorte();return {ok:false,reset:true}}const total=integrar();if(mostrarAviso&&!total&&resultado?.novas)toast('📥 '+resultado.novas+' venda(s) recebida(s)');else if(mostrarAviso&&!total&&!resultado?.novas)toast('✓ WhatsApp atualizado');}else if(mostrarAviso)toast('⚠ Não consegui buscar vendas agora');return resultado;}finally{syncRapidoEmAndamento=false;}
  };
  setInterval(()=>{if(document.hidden||syncRapidoEmAndamento||gtResetEmAndamento)return;sincronizarInboxRemoto(false).catch(()=>{});},10000);
})();