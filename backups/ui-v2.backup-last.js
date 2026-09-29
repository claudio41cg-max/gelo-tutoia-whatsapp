/* Gelo Tutóia UI v2 - configuração, produtos, rota e histórico por cliente */
(()=>{
  const PROD_KEY='gelo_tutoia_produtos_v2';
  const HIST_KEY_LOCAL=typeof HIST_KEY!=='undefined'?HIST_KEY:'gelo_tutoia_historico_dias';

  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const excecoesFiltrado=new Set([
    'marcelo 1','sou joy','inhoaiba barraca azul','barraca azul','caldo inhoaiba',
    'marcelo 2','cafe','tia','angelica','sr gilson','seu gilson'
  ]);

  let cfg={preco5:{},usa10:{},usa5:{}};
  try{cfg=Object.assign(cfg,JSON.parse(localStorage.getItem(PROD_KEY)||'{}'))}catch(e){}
  cfg.preco5=cfg.preco5||{};cfg.usa10=cfg.usa10||{};cfg.usa5=cfg.usa5||{};

  function salvarProdutos(){try{localStorage.setItem(PROD_KEY,JSON.stringify(cfg))}catch(e){}}
  function ehExcecao(n){return excecoesFiltrado.has(norm(n))}
  function getTipoCliente(n){
    try{
      const m=JSON.parse(localStorage.getItem('gelo_tutoia_cliente_meta_v1')||'{}');
      return m[n]?.tipo||'ambos';
    }catch(e){return 'ambos'}
  }
  function clienteUsaFiltrado(n){
    const t=getTipoCliente(n);return t==='filtrado'||t==='ambos';
  }
  function initProdutoCliente(n){
    if(cfg.usa10[n]===undefined)cfg.usa10[n]=true;
    if(cfg.usa5[n]===undefined)cfg.usa5[n]=false;
    if(cfg.preco5[n]===undefined)cfg.preco5[n]=0;
  }
  (CLIENTES||[]).forEach(initProdutoCliente);salvarProdutos();

  const style=document.createElement('style');
  style.textContent=`
    #gt-agent-open,.gt-agent-feature{display:none!important}
    .gt-center{text-align:center!important}
    .gt-route-row{border-bottom:1px solid var(--border);padding:10px 0}
    .gt-route-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .gt-pos{display:grid;grid-template-columns:1fr auto;gap:6px;margin-top:6px}
    .gt-mini{font-size:12px;color:var(--muted)}
    .gt-sale-row{background:rgba(255,255,255,.035);border:1px solid var(--border);border-radius:10px;padding:10px;margin:7px 0}
    .gt-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
    .gt-summary>div{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;padding:10px}
  `;document.head.appendChild(style);

  function preco5(n){return Number(cfg.preco5[n])||0}
  function produtoLabel(v){
    if(v.tipo==='esc')return 'Escamas 20 kg';
    if(v.tipo==='filt')return v.pesoKg===5?'Filtrado 5 kg':'Filtrado 10 kg';
    return 'Observação';
  }
  function pagamentoLabel(p){return p==='PIX'?'PIX':p==='Fiado'?'Fiado / a receber':'Dinheiro'}

  function carregarDias(){
    try{return JSON.parse(localStorage.getItem(HIST_KEY_LOCAL)||'[]')}catch(e){return []}
  }
  function salvarDias(dias){try{localStorage.setItem(HIST_KEY_LOCAL,JSON.stringify(dias))}catch(e){}}

  function recalcularDia(dia){
    let esc=0,filt=0,din=0,pix=0,fiad=0;
    Object.values(dia.vpc||{}).forEach(vs=>(vs||[]).forEach(v=>{
      if(v.tipo==='obs')return;
      const q=Number(v.qtd)||0,val=Number(v.valor)||0;
      if(v.tipo==='esc')esc+=q;else if(v.tipo==='filt')filt+=q;
      if(v.pag==='PIX')pix+=val;else if(v.pag==='Fiado')fiad+=val;else din+=val;
    }));
    dia.esc=esc;dia.filt=filt;dia.din=din;dia.pix=pix;dia.fiad=fiad;
    return dia;
  }
  function syncHojeDoHistorico(dia){
    if(!dia||dia.data!==dataSimples())return;
    S.vpc=dia.vpc||{};S.esc=dia.esc||0;S.filt=dia.filt||0;S.din=dia.din||0;S.pix=dia.pix||0;S.fiad=dia.fiad||0;S.caixa=S.din+S.pix;
    S.atendidos=new Set(Object.keys(S.vpc).filter(n=>(S.vpc[n]||[]).some(v=>v.tipo!=='obs')));
    S.ultima=null;salvarEstado();updHdr();
  }

  // Remove busca, assistente e desfazer global
  telaClientes=function(restore=false){
    const div=C();
    div.innerHTML=`<div class="quick-grid">
      <button class="quick-btn q-import" onclick="telaImportarWhatsApp()"><span class="qi">📥</span>Importar</button>
      <button class="quick-btn q-inbox" onclick="telaVendasRecebidas()"><span class="qi">💬</span>Recebidas</button>
      <button class="quick-btn q-report" onclick="telaRelatorio()"><span class="qi">▥</span>Relatório</button>
    </div><div class="sec-title">Clientes</div>`;
    CLIENTES.forEach(nome=>{
      const done=S.atendidos.has(nome),vs=S.vpc[nome]||[];
      const totalSacos=vs.reduce((a,v)=>a+(v.tipo!=='obs'?(Number(v.qtd)||0):0),0);
      const totalVal=vs.reduce((a,v)=>a+(Number(v.valor)||0),0);
      const btn=document.createElement('button');
      btn.className='cli-btn '+(done?'done':'norm');
      btn.innerHTML='<span style="flex:1">'+escHtml(nome)+'</span>'+(done?'<span class="cli-badge">✓ '+totalSacos+' — '+fmt(totalVal)+'</span>':'')+'<span class="cli-arrow">›</span>';
      btn.onclick=()=>{scrollPos=btn.offsetTop-30;telaVenda(nome)};
      div.appendChild(btn);
    });
    div.insertAdjacentHTML('beforeend','<div class="divider"></div>');
    addBtn(div,'DESPESAS: −'+fmt(S.desp),'act-btn btn-desp',telaDespesas);
    addBtn(div,'RELATÓRIO DO DIA','act-btn btn-rel',telaConferencia);
    addBtn(div,'📥 IMPORTAR VENDAS DO WHATSAPP','act-btn btn-rel',telaImportarWhatsApp);
    addBtn(div,'💬 VENDAS RECEBIDAS','act-btn btn-rel',telaVendasRecebidas);
    addBtn(div,'📋 HISTÓRICO DO DIA','act-btn btn-back',telaHistorico);
    addBtn(div,'⚙️ CONFIGURAÇÕES','act-btn btn-back',telaConfiguracoes);
    addBtn(div,'REINICIAR TUDO','act-btn btn-reset',()=>{
      confirmar('Reiniciar o dia?','Todos os dados serão apagados. Tem certeza?','Sim, reiniciar',()=>{
        S={esc:0,filt:0,caixa:0,pix:0,din:0,desp:0,fiad:0,vpc:{},despDia:[],atendidos:new Set(),ultima:null,qtd:1};
        salvarEstado();salvarDiaNoHistorico();updHdr();telaClientes();toast('✓ Novo dia!');
      });
    });
    if(restore&&scrollPos>0)setTimeout(()=>{div.scrollTop=scrollPos},60);
  };

  function abrirEscolhaFiltrado(nome){
    initProdutoCliente(nome);
    if(ehExcecao(nome)){telaQtd(nome,'filt',P_FILT[nome]);return}
    const b10=cfg.usa10[nome]!==false;
    const b5=cfg.usa5[nome]===true;
    let h=`<div class="pg-hdr"><div class="pg-title">${escHtml(nome)}</div><div class="pg-sub">ESCOLHA O FILTRADO</div></div>`;
    if(b10)h+=`<button class="tipo-btn tp-filt" onclick="telaQtdPeso('${escHtml(nome)}',10,${Number(P_FILT[nome])||0})"><span class="tn">💎 FILTRADO 10 KG</span><span class="tp">${fmt(Number(P_FILT[nome])||0)}/saco</span></button>`;
    if(b5){
      const p5=preco5(nome);
      h+=`<button class="tipo-btn tp-filt" onclick="telaQtdPeso('${escHtml(nome)}',5,${p5})"><span class="tn">💎 FILTRADO 5 KG</span><span class="tp">${p5>0?fmt(p5)+'/saco':'Configure o preço'}</span></button>`;
    }
    if(!b10&&!b5)h+=`<div class="conf-card">Nenhum tamanho de filtrado ativado para este cliente.</div>`;
    h+=`<button class="act-btn btn-back" onclick="telaVenda('${escHtml(nome)}')">‹ Voltar</button>`;abrirSub(h);
  }
  window.telaQtdPeso=function(nome,peso,preco){
    if(!(preco>0))return toast('⚠ Configure o preço deste produto');
    nomeCur=nome;tipoCur='filt';precoCur=preco;S.qtd=1;window.gtPesoCur=peso;renderQtd();
  };

  const renderQtdBase=renderQtd;
  renderQtd=function(){
    renderQtdBase();
    if(tipoCur==='filt'&&window.gtPesoCur){
      const s=S2().querySelector('.pg-sub');if(s)s.textContent='FILTRADO '+window.gtPesoCur+' KG';
    }
  };

  // Tela do cliente com histórico/correção
  telaVenda=function(nome){
    nomeCur=nome;window.gtPesoCur=null;
    const pE=P_ESC[nome],pF=P_FILT[nome],vs=S.vpc[nome]||[];
    const resumo=vs.map(v=>v.qtd+'×'+(v.tipo==='esc'?'E':v.tipo==='filt'?(v.pesoKg===5?'F5':'F10'):'O')+'('+(v.pag==='PIX'?'P':v.pag==='Fiado'?'F':'D')+')').join('  ');
    const fone=FONES[nome]||'',foneFmt=fone?'('+fone.slice(2,4)+') '+fone.slice(4,9)+'-'+fone.slice(9):'';
    const foneHtml=fone?`<div style="text-align:center;margin:6px 14px 0;padding:10px 14px;background:rgba(0,0,0,.2);border-radius:10px;font-size:20px;color:#22ff99;font-weight:800">📞 ${foneFmt}</div>`:'';
    const t=getTipoCliente(nome);
    abrirSub(`
      <div class="pg-hdr"><div class="pg-title">${escHtml(nome)}</div></div>
      ${foneHtml}${vs.length?`<div class="vendas-hoje">Hoje: ${resumo}</div>`:''}
      ${t!=='filtrado'?`<button class="tipo-btn tp-esc" onclick="telaQtd('${escHtml(nome)}','esc',${pE})"><span class="tn">❄ ESCAMAS 20 KG</span><span class="tp">${fmt(pE)}/saco</span></button>`:''}
      ${t!=='escamas'?`<button class="tipo-btn tp-filt" onclick="abrirEscolhaFiltrado('${escHtml(nome)}')"><span class="tn">💎 FILTRADO</span><span class="tp">${ehExcecao(nome)?fmt(pF)+'/saco':'10 kg / 5 kg'}</span></button>`:''}
      <button class="tipo-btn tp-obs" onclick="telaObs('${escHtml(nome)}')"><span class="tn">📝 OBSERVAÇÃO</span></button>
      <button class="act-btn btn-rel" onclick="telaHistoricoCliente('${escHtml(nome)}')">📊 HISTÓRICO / CORRIGIR VENDAS</button>
      <button class="act-btn btn-back" onclick="fecharSub(true)">‹ Voltar</button>`);
  };

  const finalizarBase=finalizar;
  finalizar=function(fp){
    const peso=tipoCur==='filt'?(window.gtPesoCur||10):20;
    finalizarBase(fp);
    const arr=S.vpc[nomeCur]||[];
    if(arr.length&&arr[arr.length-1].tipo==='filt')arr[arr.length-1].pesoKg=peso;
    salvarEstado();salvarDiaNoHistorico();
  };

  window.telaHistoricoCliente=function(nome){
    salvarDiaNoHistorico();
    const dias=carregarDias().filter(d=>(d.vpc?.[nome]||[]).length);
    let totalE=0,totalF10=0,totalF5=0,totalV=0,totalPix=0,totalDin=0,totalFia=0;
    dias.forEach(d=>(d.vpc[nome]||[]).forEach(v=>{
      if(v.tipo==='esc')totalE+=Number(v.qtd)||0;
      if(v.tipo==='filt'&&v.pesoKg===5)totalF5+=Number(v.qtd)||0;
      if(v.tipo==='filt'&&v.pesoKg!==5)totalF10+=Number(v.qtd)||0;
      totalV+=Number(v.valor)||0;
      if(v.pag==='PIX')totalPix+=Number(v.valor)||0;else if(v.pag==='Fiado')totalFia+=Number(v.valor)||0;else totalDin+=Number(v.valor)||0;
    }));
    let h=`<div class="pg-hdr"><div class="pg-title">${escHtml(nome)}</div><div class="pg-sub">Histórico e correção</div></div>
      <div class="gt-summary"><div>Escamas 20 kg<br><b>${totalE} sacos</b></div><div>Filtrado 10 kg<br><b>${totalF10} sacos</b></div><div>Filtrado 5 kg<br><b>${totalF5} sacos</b></div><div>Total<br><b>${fmt(totalV)}</b></div></div>
      <div class="conf-card"><div>PIX: <b>${fmt(totalPix)}</b></div><div>Dinheiro: <b>${fmt(totalDin)}</b></div><div>A receber: <b>${fmt(totalFia)}</b></div></div>`;
    if(!dias.length)h+='<div class="conf-card">Nenhuma venda registrada para este cliente.</div>';
    dias.forEach((d,di)=>{
      h+=`<div class="conf-card"><div style="font-weight:800;color:var(--gold)">${d.data}</div>`;
      (d.vpc[nome]||[]).forEach((v,vi)=>{
        h+=`<div class="gt-sale-row"><div><b>${produtoLabel(v)}</b> · ${v.qtd} saco(s) · ${pagamentoLabel(v.pag)} · ${fmt(Number(v.valor)||0)}</div>
          <button class="act-btn btn-rel" style="margin:7px 0 0" onclick="editarVendaCliente('${escHtml(nome)}','${d.data}',${vi})">✏️ Corrigir</button></div>`;
      });h+='</div>';
    });
    h+=`<button class="act-btn btn-back" onclick="telaVenda('${escHtml(nome)}')">‹ Voltar</button>`;abrirSub(h);
  };

  window.editarVendaCliente=function(nome,data,idx){
    const dias=carregarDias(),d=dias.find(x=>x.data===data),v=d?.vpc?.[nome]?.[idx];if(!v)return;
    const peso=v.tipo==='filt'?(v.pesoKg===5?5:10):20;
    abrirSub(`<div class="pg-hdr"><div class="pg-title">CORRIGIR VENDA</div><div class="pg-sub">${escHtml(nome)} · ${data}</div></div>
      <label>Produto</label><select id="gt-ed-prod" class="inp">
        <option value="esc" ${v.tipo==='esc'?'selected':''}>Gelo escamas 20 kg</option>
        <option value="f10" ${v.tipo==='filt'&&peso===10?'selected':''}>Gelo filtrado 10 kg</option>
        <option value="f5" ${v.tipo==='filt'&&peso===5?'selected':''}>Gelo filtrado 5 kg</option>
      </select>
      <label>Quantidade</label><input id="gt-ed-qtd" class="inp" type="number" min="1" value="${Number(v.qtd)||1}">
      <label>Valor total</label><input id="gt-ed-val" class="inp" type="number" step="0.01" value="${Number(v.valor)||0}">
      <label>Pagamento</label><select id="gt-ed-pag" class="inp"><option ${v.pag==='Dinheiro'?'selected':''}>Dinheiro</option><option ${v.pag==='PIX'?'selected':''}>PIX</option><option ${v.pag==='Fiado'?'selected':''}>Fiado</option></select>
      <button class="btn-confirm" onclick="salvarCorrecaoVenda('${escHtml(nome)}','${data}',${idx})">SALVAR CORREÇÃO</button>
      <button class="act-btn btn-reset" onclick="excluirVendaCliente('${escHtml(nome)}','${data}',${idx})">🗑 EXCLUIR ESTA VENDA</button>
      <button class="act-btn btn-back" onclick="telaHistoricoCliente('${escHtml(nome)}')">‹ Voltar</button>`);
  };

  window.salvarCorrecaoVenda=function(nome,data,idx){
    const dias=carregarDias(),d=dias.find(x=>x.data===data),v=d?.vpc?.[nome]?.[idx];if(!v)return;
    const prod=document.getElementById('gt-ed-prod').value,q=Number(document.getElementById('gt-ed-qtd').value)||0,val=Number(document.getElementById('gt-ed-val').value)||0,pag=document.getElementById('gt-ed-pag').value;
    if(q<1||val<0)return toast('⚠ Confira quantidade e valor');
    v.tipo=prod==='esc'?'esc':'filt';v.pesoKg=prod==='f5'?5:prod==='f10'?10:20;v.qtd=q;v.valor=val;v.pag=pag;
    recalcularDia(d);salvarDias(dias);syncHojeDoHistorico(d);toast('✓ Venda corrigida');telaHistoricoCliente(nome);
  };
  window.excluirVendaCliente=function(nome,data,idx){
    confirmar('Excluir venda?','Esta venda será removida do histórico e os totais serão recalculados.','Sim, excluir',()=>{
      const dias=carregarDias(),d=dias.find(x=>x.data===data);if(!d?.vpc?.[nome])return;
      d.vpc[nome].splice(idx,1);recalcularDia(d);salvarDias(dias);syncHojeDoHistorico(d);toast('🗑 Venda excluída');telaHistoricoCliente(nome);
    });
  };

  // Configuração simplificada
  window.telaConfiguracoes=function(){
    let h=`<div class="pg-hdr gt-center"><div class="pg-title gt-center">⚙️ CONFIGURAÇÕES</div><div class="pg-sub gt-center">Clientes, rota e preços</div></div>
      <div class="conf-card"><div style="font-weight:800;margin-bottom:8px">💲 PREÇO POR CLIENTE</div>
      <select id="cfg-preco-cliente" class="inp" onchange="carregarPrecoClienteSelecionado()"><option value="">Escolha o cliente</option>${CLIENTES.map(n=>`<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('')}</select>
      <label>Gelo escamas 20 kg</label><input id="cfg-preco-esc" class="inp" type="number" step="0.50">
      <label>Gelo filtrado 10 kg</label><input id="cfg-preco-filt" class="inp" type="number" step="0.50">
      <div id="gt-f5-area"><label>Gelo filtrado 5 kg</label><input id="cfg-preco-filt5" class="inp" type="number" step="0.50" placeholder="Preço do filtrado 5 kg">
      <label><input type="checkbox" id="cfg-usa10"> Oferecer filtrado 10 kg</label><label><input type="checkbox" id="cfg-usa5"> Oferecer filtrado 5 kg</label></div>
      <button class="btn-confirm" onclick="salvarPrecoClienteSelecionado()">SALVAR PREÇOS DESTE CLIENTE</button></div>
      <div class="conf-card"><div style="font-weight:800;margin-bottom:8px">ROTA DOS CLIENTES</div>`;
    CLIENTES.forEach((n,i)=>{
      h+=`<div class="gt-route-row" id="gt-route-${i}"><div style="font-weight:800;margin-bottom:6px">${i+1}. ${escHtml(n)}</div><div class="gt-route-grid">
      <button class="act-btn btn-back" style="margin:0" onclick="moverCliente(${i},-1)">▲ Subir</button>
      <button class="act-btn btn-back" style="margin:0" onclick="moverCliente(${i},1)">▼ Descer</button>
      <button class="act-btn btn-rel" style="margin:0" onclick="editarCliente(${i})">✏️ Editar</button>
      <button class="act-btn btn-reset" style="margin:0" onclick="excluirCliente(${i})">🗑 Excluir</button></div>
      <div class="gt-pos"><input class="inp" style="margin:0" id="gt-pos-${i}" type="number" min="1" max="${CLIENTES.length}" placeholder="Mover para posição"><button class="act-btn btn-rel" style="margin:0" onclick="moverParaPosicao(${i})">Mover</button></div></div>`;
    });
    h+=`</div><button class="btn-confirm" onclick="novoCliente()">＋ ADICIONAR CLIENTE</button><button class="act-btn btn-back" onclick="fecharSub(false)">‹ Voltar</button>`;abrirSub(h);
  };

  window.carregarPrecoClienteSelecionado=function(){
    const n=document.getElementById('cfg-preco-cliente').value,e=document.getElementById('cfg-preco-esc'),f=document.getElementById('cfg-preco-filt'),f5=document.getElementById('cfg-preco-filt5'),area=document.getElementById('gt-f5-area');
    if(!n){e.value='';f.value='';f5.value='';return}
    initProdutoCliente(n);e.value=P_ESC[n]??'';f.value=P_FILT[n]??'';f5.value=preco5(n)||'';
    const ex=ehExcecao(n);area.style.display=ex?'none':'block';
    document.getElementById('cfg-usa10').checked=cfg.usa10[n]!==false;document.getElementById('cfg-usa5').checked=cfg.usa5[n]===true;
  };
  window.salvarPrecoClienteSelecionado=function(){
    const n=document.getElementById('cfg-preco-cliente').value;if(!n)return toast('⚠ Escolha um cliente');
    const pe=Number(document.getElementById('cfg-preco-esc').value),pf=Number(document.getElementById('cfg-preco-filt').value);
    if(pe>0)P_ESC[n]=pe;if(pf>0)P_FILT[n]=pf;
    initProdutoCliente(n);
    if(!ehExcecao(n)){
      const p5=Number(document.getElementById('cfg-preco-filt5').value)||0;cfg.preco5[n]=p5;
      cfg.usa10[n]=document.getElementById('cfg-usa10').checked;cfg.usa5[n]=document.getElementById('cfg-usa5').checked;
      if(cfg.usa5[n]&&!(p5>0))return toast('⚠ Informe o preço do filtrado 5 kg');
    }
    salvarProdutos();salvarConfig();toast('✓ Preços de '+n+' salvos');
  };

  window.moverCliente=function(i,d){
    const pos=S2().scrollTop,j=i+d;if(j<0||j>=CLIENTES.length)return;
    [CLIENTES[i],CLIENTES[j]]=[CLIENTES[j],CLIENTES[i]];salvarConfig();telaConfiguracoes();
    setTimeout(()=>{S2().scrollTop=Math.max(0,pos)},20);
  };
  window.moverParaPosicao=function(i){
    const inp=document.getElementById('gt-pos-'+i),dest=(Number(inp?.value)||0)-1;if(dest<0||dest>=CLIENTES.length||dest===i)return toast('⚠ Informe uma posição válida');
    const pos=S2().scrollTop,item=CLIENTES.splice(i,1)[0];CLIENTES.splice(dest,0,item);salvarConfig();telaConfiguracoes();
    setTimeout(()=>{S2().scrollTop=Math.max(0,pos)},20);
  };

  const novoBase=novoCliente;
  window.novoCliente=function(){
    abrirSub(`<div class="pg-hdr"><div class="pg-title">NOVO CLIENTE</div><div class="pg-sub">Escolha também a posição na rota</div></div>
      <input id="nv-nome" class="inp" placeholder="Nome do cliente">
      <input id="nv-esc" class="inp" type="number" step="0.50" value="${PRECO_GERAL_ESC}" placeholder="Preço escamas 20 kg">
      <input id="nv-filt" class="inp" type="number" step="0.50" value="${PRECO_GERAL_FILT}" placeholder="Preço filtrado 10 kg">
      <input id="nv-pos" class="inp" type="number" min="1" max="${CLIENTES.length+1}" value="${CLIENTES.length+1}" placeholder="Posição na rota">
      <button class="btn-confirm" onclick="adicionarClienteV2()">ADICIONAR</button><button class="act-btn btn-back" onclick="telaConfiguracoes()">‹ Voltar</button>`);
  };
  window.adicionarClienteV2=function(){
    const n=document.getElementById('nv-nome').value.trim(),pe=Number(document.getElementById('nv-esc').value),pf=Number(document.getElementById('nv-filt').value),pos=Math.min(Math.max((Number(document.getElementById('nv-pos').value)||CLIENTES.length+1)-1,0),CLIENTES.length);
    if(!n||!(pe>0)||!(pf>0))return toast('⚠ Confira nome e preços');if(CLIENTES.includes(n))return toast('⚠ Esse cliente já existe');
    CLIENTES.splice(pos,0,n);P_ESC[n]=pe;P_FILT[n]=pf;initProdutoCliente(n);salvarProdutos();salvarConfig();toast('✓ Cliente adicionado');telaConfiguracoes();
  };

  // limpa assistente já inserido na tela
  setTimeout(()=>{document.getElementById('gt-agent-open')?.remove();document.querySelectorAll('.gt-agent-feature').forEach(x=>x.remove())},0);
})();