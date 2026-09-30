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
      if(!['Pendente','Confirmada'].includes(v.status)||!v.remoteId||!hoje(v.criadoEm))continue;
      if(!vendaLocalValida(v))continue;

      const faltandoNoDia=!jaLancada(v.remoteId);
      if(faltandoNoDia){
        if(['PIX','Dinheiro','Fiado'].includes(v.pag))lancarRecebidaNoDia(v);
        else lancarSemPagamento(v);
        total++;
        if(v.confianca==='revisar'||!['PIX','Dinheiro','Fiado'].includes(v.pag))revisar++;
      }

      // "Confirmada" no inbox não significa que a venda pode sumir do movimento local.
      // Se o app foi zerado/recarregado e a venda de hoje não existe mais na tela principal,
      // ela é restaurada automaticamente sem duplicar.
      if(v.status!=='Confirmada'||faltandoNoDia){
        v.status='Confirmada';v.origem='WhatsApp automático';v.syncRemoto='pendente';alterou=true;
      }
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
  setTimeout(()=>{try{limparFalsosPositivosLocais();sincronizarInboxRemoto(false)}catch(e){}},350);
  sincronizarInboxRemoto=async function(mostrarAviso=true){
    const resultado=await syncAnterior(mostrarAviso);
    if(resultado?.ok){
      integrar();
      for(const v of vendasRecebidas.filter(x=>x.status==='Confirmada'&&x.syncRemoto==='pendente')){
        await marcarStatusRemoto(v,'confirmada_app');
      }
    }
    return resultado;
  };
})();
