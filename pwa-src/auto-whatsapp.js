/* Integra mensagens verificadas do WhatsApp ao movimento do dia. */
(()=>{
  const syncAnterior=sincronizarInboxRemoto;
  const PANEL_INBOX_API='https://painel-clientes-production.up.railway.app/api/gelo/inbox';
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
  const telaClientesAnterior=telaClientes;
  telaClientes=function(...args){const r=telaClientesAnterior.apply(this,args);setTimeout(mostrarStatus,0);return r};
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
  function jaLancada(id){
    return Object.values(S.vpc||{}).some(lista=>Array.isArray(lista)&&lista.some(v=>v.remoteId===id));
  }
  function hoje(iso){
    const data=new Date(iso);
    return !Number.isNaN(data.getTime())&&data.toLocaleDateString('pt-BR')===new Date().toLocaleDateString('pt-BR');
  }
  function lancarSemPagamento(v){
    const item={tipo:v.tipo,qtd:v.qtd,pag:'Não informado',preco:v.preco,valor:v.valor,hora:v.hora||horaAgora(),origem:'WhatsApp automático',remoteId:v.remoteId,remoteKey:v.remoteKey,iaRevisar:v.confianca==='revisar'};
    if(!S.vpc[v.cliente])S.vpc[v.cliente]=[];
    S.vpc[v.cliente].push(item);
    if(v.tipo==='esc')S.esc+=Number(v.qtd)||0;else if(v.tipo==='filt')S.filt+=Number(v.qtd)||0;
    S.atendidos.add(v.cliente);
  }
  function vendaLocalValida(v){
    const texto=String(v?.transcricao||v?.texto||v?.texto_origem||'');
    const soLink=/^\s*(https?:\/\/|www\.)/i.test(texto);
    return !soLink&&CLIENTES.includes(v?.cliente)&&Number.isInteger(v?.qtd)&&v.qtd>=1&&v.qtd<=200&&['esc','filt'].includes(v?.tipo)&&Number.isFinite(v?.valor)&&v.valor>0;
  }
  function limparFalsosPositivosLocais(){
    const antes=vendasRecebidas.length;
    // Não reatribuir vendasRecebidas: na base do app ela pode ser const.
    // Remove apenas os falsos positivos, preservando a referência usada pelas telas.
    for(let i=vendasRecebidas.length-1;i>=0;i--){
      const v=vendasRecebidas[i];
      if(v?.status==='Pendente'&&!vendaLocalValida(v))vendasRecebidas.splice(i,1);
    }
    if(vendasRecebidas.length!==antes)salvarInbox();
  }
  function integrar(){
    limparFalsosPositivosLocais();
    let total=0,alterou=false,revisar=0;
    for(const v of vendasRecebidas){
      // Só vendas novas e ainda pendentes podem entrar automaticamente no movimento do dia.
      // Itens que já estão em Confirmadas servem apenas como histórico e nunca são relançados.
      if(v.status!=='Pendente'||!v.remoteId||!hoje(v.criadoEm))continue;
      if(!vendaLocalValida(v))continue;

      if(!jaLancada(v.remoteId)){
        if(['PIX','Dinheiro','Fiado'].includes(v.pag))lancarRecebidaNoDia(v);
        else lancarSemPagamento(v);
        total++;
        if(v.confianca==='revisar'||!['PIX','Dinheiro','Fiado'].includes(v.pag))revisar++;
      }

      v.status='Confirmada';v.origem='WhatsApp automático';v.syncRemoto='pendente';alterou=true;
    }
    if(alterou){
      // Durante os testes, toda venda reconhecível entra direto no movimento do dia.
      // Itens duvidosos permanecem marcados para conferência/correção no relatório.
      salvarEstado();salvarDiaNoHistorico();salvarInbox();updHdr();
      // Atualiza imediatamente a tela principal para a venda aparecer na frente do app.
      try{telaClientes(true)}catch(e){console.log('Gelo Tutóia - falha ao atualizar tela principal:',e)}
      if(total)toast(`✓ ${total} venda${total>1?'s':''} do WhatsApp lançada${total>1?'s':''} automaticamente${revisar?' · '+revisar+' para revisar':''}`);
    }
    return total;
  }
  atualizarVendasWhatsApp=async function(){
    return sincronizarInboxRemoto(false);
  };


  function recalcularMovimentoDoDia(){
    let esc=0,filt=0,pix=0,din=0,fiad=0;
    for(const lista of Object.values(S.vpc||{})){
      for(const v of Array.isArray(lista)?lista:[]){
        if(v.tipo==='obs')continue;
        const q=Number(v.qtd)||0,val=Number(v.valor)||0;
        if(v.tipo==='esc')esc+=q; else if(v.tipo==='filt')filt+=q;
        if(v.pag==='PIX')pix+=val; else if(v.pag==='Fiado')fiad+=val; else if(v.pag==='Dinheiro')din+=val;
      }
    }
    S.esc=esc;S.filt=filt;S.pix=pix;S.din=din;S.fiad=fiad;S.caixa=pix+din;
    S.atendidos=new Set(Object.keys(S.vpc||{}).filter(n=>(S.vpc[n]||[]).some(v=>v.tipo!=='obs')));
    salvarEstado();salvarDiaNoHistorico();updHdr();
  }
  window.excluirVendaRecebida=function(id){
    const i=vendasRecebidas.findIndex(x=>String(x.id)===String(id));
    if(i<0)return;
    const v=vendasRecebidas[i];
    confirmar('Excluir este registro?','A venda será removida do histórico de Recebidas e, se estiver no movimento do dia, também sairá dos totais.','Sim, excluir',()=>{
      if(v.remoteId&&S.vpc?.[v.cliente]){
        S.vpc[v.cliente]=S.vpc[v.cliente].filter(x=>x.remoteId!==v.remoteId);
      }
      vendasRecebidas.splice(i,1);
      salvarInbox();recalcularMovimentoDoDia();
      toast('🗑 Venda excluída');
      telaVendasRecebidas('Confirmada');
    });
  };
  telaVendasRecebidas=function(filtro='Confirmada'){
    if(filtro==='Pendente')filtro='Confirmada';
    sincronizarInboxRemoto(false).catch(()=>{});
    const lista=vendasRecebidas.filter(v=>v.status===filtro);
    const conf=vendasRecebidas.filter(v=>v.status==='Confirmada').length;
    const ign=vendasRecebidas.filter(v=>v.status==='Ignorada').length;
    let h=`<div class="pg-hdr"><div class="pg-title">💬 VENDAS RECEBIDAS</div>
      <div class="pg-sub">Histórico das vendas do WhatsApp</div></div>
      <div style="margin:0 14px 10px;padding:10px 12px;border-radius:12px;background:#12354f;color:#dff4ff;font-size:12px;text-align:center">✓ Sincronização automática ativa</div>
      <div class="tabs3" style="grid-template-columns:1fr 1fr">
        <button class="tab3 ${filtro==='Confirmada'?'active':''}" onclick="telaVendasRecebidas('Confirmada')">Confirmadas ${conf}</button>
        <button class="tab3 ${filtro==='Ignorada'?'active':''}" onclick="telaVendasRecebidas('Ignorada')">Ignoradas ${ign}</button>
      </div>`;
    if(!lista.length)h+='<div class="empty">Nenhuma venda nesta área.</div>';
    lista.slice().reverse().forEach(v=>{
      h+=`<div class="inbox-card">
        <div class="inbox-top"><b>🕒 ${escHtml(v.hora||'')}</b><span class="status-pill st-${String(v.status).toLowerCase()}">${v.status}</span></div>
        <div style="font-size:11px;color:#1689ff;font-weight:800;margin-bottom:4px">${escHtml(v.origem||'WhatsApp')}${v.confianca?` · IA: ${escHtml(v.confianca)}`:''}</div>
        <div style="font-size:13px;color:#536b7b;margin-bottom:7px">"${escHtml(v.transcricao||'')}"</div>
        <div style="font-weight:900">${escHtml(v.cliente||'')}</div>
        <div>${Number(v.qtd)||0}x ${v.tipo==='esc'?'Escamas':'Filtrado'} · <b>${escHtml(v.pag||'Não informado')}</b> · ${fmt(Number(v.valor)||0)}</div>
        <div class="inbox-actions"><button class="mini-btn mini-no" onclick="excluirVendaRecebida('${v.id}')">🗑 Excluir</button></div>
      </div>`;
    });
    h+='<button class="act-btn btn-back" onclick="fecharSub(false)">‹ Voltar</button>';
    abrirSub(h);atualizarBadgeInbox();
  };

  let syncRapidoEmAndamento=false;
  setTimeout(()=>{try{limparFalsosPositivosLocais();sincronizarInboxRemoto(false)}catch(e){}},150);
  setTimeout(()=>{try{sincronizarInboxRemoto(false)}catch(e){}},1800);
  async function sincronizarViaPainel(mostrarAviso){
    try{
      const r=await fetch(PANEL_INBOX_API+'?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();
      const lista=Array.isArray(d?.vendas)?d.vendas:[];
      let novas=0,ignoradas=0;
      for(const x of lista){
        const remoteId=String(x?.remote_id||'');
        if(!remoteId||vendasRecebidas.some(v=>String(v?.remoteId||'')===remoteId))continue;
        const cliente=String(x?.cliente||'');
        const tipo=x?.tipo==='filt'?'filt':'esc';
        const qtd=Number(x?.qtd)||0;
        const pag=['Dinheiro','PIX','Fiado'].includes(x?.pagamento)?x.pagamento:'Não informado';
        if(!CLIENTES.includes(cliente)||!Number.isInteger(qtd)||qtd<1||qtd>200){
          ignoradas++;
          continue;
        }
        const preco=precoVendaRemota(cliente,tipo);
        vendasRecebidas.push({
          id:'remoto-'+remoteId,
          remoteId,
          remoteKey:String(x?.remote_key||''),
          criadoEm:x?.recebido_em||new Date().toISOString(),
          hora:horaDaDataIso(x?.recebido_em),
          origem:'WhatsApp automático',
          transcricao:String(x?.transcricao||''),
          cliente,qtd,tipo,pag,preco,valor:preco*qtd,
          status:'Pendente',
          confianca:x?.confianca||'revisar',
          syncRemoto:'ok'
        });
        novas++;
      }
      if(novas)salvarInbox();
      atualizarBadgeInbox();
      if(mostrarAviso&&!novas&&!ignoradas)toast('✓ WhatsApp atualizado');
      return {ok:true,novas,ignoradas,via:'painel'};
    }catch(e){
      console.warn('Falha também no caminho reserva do painel',e);
      if(mostrarAviso)toast('⚠ Não consegui buscar vendas agora');
      return {ok:false,erro:String(e),via:'painel'};
    }
  }

  sincronizarInboxRemoto=async function(mostrarAviso=true){
    if(syncRapidoEmAndamento)return {ok:false,ocupado:true};
    syncRapidoEmAndamento=true;
    try{
      let resultado=await syncAnterior(false);
      if(!resultado?.ok)resultado=await sincronizarViaPainel(mostrarAviso);
      if(resultado?.ok){
        const total=integrar();
        for(const v of vendasRecebidas.filter(x=>x.status==='Confirmada'&&x.syncRemoto==='pendente')){
          await marcarStatusRemoto(v,'confirmada_app');
        }
        if(mostrarAviso&&!total&&resultado?.novas)toast('📥 '+resultado.novas+' venda(s) recebida(s)');
        else if(mostrarAviso&&!total&&!resultado?.novas&&resultado?.via!=='painel')toast('✓ WhatsApp atualizado');
      }else if(mostrarAviso&&resultado?.via!=='painel'){
        toast('⚠ Não consegui buscar vendas agora');
      }
      return resultado;
    }finally{
      syncRapidoEmAndamento=false;
    }
  };
  setInterval(()=>{
    if(document.hidden||syncRapidoEmAndamento)return;
    sincronizarInboxRemoto(false).catch(()=>{});
  },5000);
})();
