/* Integra mensagens verificadas do WhatsApp ao movimento do dia. */
(()=>{
  const syncAnterior=sincronizarInboxRemoto;
  const lancarAnterior=lancarRecebidaNoDia;
  const confirmarAnterior=confirmarVendaRecebida;
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
