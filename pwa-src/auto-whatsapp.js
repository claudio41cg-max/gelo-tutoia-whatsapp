/* Integra mensagens verificadas do WhatsApp ao movimento do dia. */
(()=>{
  const syncAnterior=sincronizarInboxRemoto;
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
  function integrar(){
    let total=0,alterou=false;
    for(const v of vendasRecebidas){
      if(v.status!=='Pendente'||v.auto_elegivel!==true||!v.remoteId||!hoje(v.criadoEm))continue;
      if(!CLIENTES.includes(v.cliente)||!Number.isInteger(v.qtd)||v.qtd<1||v.qtd>200||!['PIX','Dinheiro','Fiado'].includes(v.pag))continue;
      if(!Number.isFinite(v.valor)||v.valor<=0)continue;
      if(!jaLancada(v.remoteId)){lancarRecebidaNoDia(v);total++}
      v.status='Confirmada';v.origem='WhatsApp automático';v.syncRemoto='pendente';alterou=true;
    }
    if(alterou){
      // O identificador da mensagem é salvo junto da venda para não duplicar após recarregar.
      salvarEstado();salvarDiaNoHistorico();salvarInbox();updHdr();
      if(!S2().classList.contains('ativa'))telaClientes(true);
      if(total)toast(`✓ ${total} venda${total>1?'s':''} do WhatsApp lançada${total>1?'s':''} automaticamente`);
    }
    return total;
  }
  sincronizarInboxRemoto=async function(mostrarAviso=true){
    const resultado=await syncAnterior(mostrarAviso);
    if(resultado?.ok){
      integrar();
      for(const v of vendasRecebidas.filter(x=>x.status==='Confirmada'&&x.auto_elegivel===true&&x.syncRemoto==='pendente')){
        await marcarStatusRemoto(v,'confirmada_app');
      }
    }
    return resultado;
  };
})();
