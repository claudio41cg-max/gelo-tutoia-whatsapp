/* Gelo Tutóia UI v3 - histórico semanal, filtrados e caderno do fiado */
(()=>{
  const HIST=typeof HIST_KEY!=='undefined'?HIST_KEY:'gelo_tutoia_historico_dias';
  const PROD='gelo_tutoia_produtos_v2';
  const PAYKEY='gelo_tutoia_fiado_pagamentos_v1';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const excecoes=new Set(['marcelo 1','sou joy','inhoaiba barraca azul','barraca azul','caldo inhoaiba','marcelo 2','cafe','tia','angelica','sr gilson','seu gilson']);
  const esc=s=>typeof escHtml==='function'?escHtml(String(s||'')):String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dinheiro=n=>typeof fmt==='function'?fmt(Number(n)||0):('R$ '+(Number(n)||0).toFixed(2).replace('.',','));
  function dias(){try{return JSON.parse(localStorage.getItem(HIST)||'[]')}catch(e){return[]}}
  function saveDias(v){try{localStorage.setItem(HIST,JSON.stringify(v))}catch(e){}}
  function produtos(){try{return Object.assign({preco5:{},usa10:{},usa5:{}},JSON.parse(localStorage.getItem(PROD)||'{}'))}catch(e){return{preco5:{},usa10:{},usa5:{}}}}
  function pagamentos(){try{return JSON.parse(localStorage.getItem(PAYKEY)||'[]')}catch(e){return[]}}
  function savePag(v){try{localStorage.setItem(PAYKEY,JSON.stringify(v))}catch(e){}}
  function tipoCliente(n){try{return JSON.parse(localStorage.getItem('gelo_tutoia_cliente_meta_v1')||'{}')[n]?.tipo||'ambos'}catch(e){return'ambos'}}
  function parseData(s){const [d,m,y]=String(s||'').split('/').map(Number);return new Date(y,m-1,d,12)}
  function keyMes(dt){return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')}
  function mesNome(dt){return dt.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).toUpperCase()}
  function dataBR(dt){return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()}
  function inicioSemana(dt){const d=new Date(dt),w=d.getDay(),dif=w===0?-6:1-w;d.setDate(d.getDate()+dif);return d}
  function fimSemana(dt){const d=inicioSemana(dt);d.setDate(d.getDate()+6);return d}
  function peso(v){return v.tipo==='filt'?(v.pesoKg===5?5:10):20}
  function produto(v){return v.tipo==='esc'?'Escamas 20 kg':v.tipo==='filt'?'Filtrado '+peso(v)+' kg':'Observação'}
  function somaVendas(vs){return(vs||[]).reduce((a,v)=>{if(v.tipo==='obs')return a;const q=Number(v.qtd)||0,val=Number(v.valor)||0;a.sacos+=q;a.valor+=val;if(v.tipo==='esc')a.esc+=q;else if(v.tipo==='filt'&&peso(v)===5)a.f5+=q;else if(v.tipo==='filt')a.f10+=q;if(v.pag==='PIX')a.pix+=val;else if(v.pag==='Fiado')a.fiado+=val;else a.din+=val;return a},{esc:0,f10:0,f5:0,sacos:0,valor:0,pix:0,din:0,fiado:0})}
  function soma(a,b){Object.keys(a).forEach(k=>a[k]+=(b[k]||0));return a}
  function zerado(){return{esc:0,f10:0,f5:0,sacos:0,valor:0,pix:0,din:0,fiado:0}}
  function recalcularDia(d){const t=zerado();Object.values(d.vpc||{}).forEach(vs=>soma(t,somaVendas(vs)));d.esc=t.esc;d.filt=t.f10+t.f5;d.din=t.din;d.pix=t.pix;d.fiad=t.fiado;return d}
  function syncHoje(d){if(!d||d.data!==dataSimples())return;S.vpc=d.vpc||{};S.esc=d.esc||0;S.filt=d.filt||0;S.din=d.din||0;S.pix=d.pix||0;S.fiad=d.fiad||0;S.caixa=S.din+S.pix;S.atendidos=new Set(Object.keys(S.vpc).filter(n=>(S.vpc[n]||[]).some(v=>v.tipo!=='obs')));S.ultima=null;salvarEstado();updHdr()}

  const st=document.createElement('style');
  st.textContent=`
    .gt-client-actions .tipo-btn{padding:18px 20px!important;margin:7px 14px!important;border-radius:18px!important;min-height:0!important}
    .gt-client-actions .tipo-btn .tn{font-size:28px!important;line-height:1.12}
    .gt-client-actions .tipo-btn .tp{font-size:15px!important}
    .gt-corrigir{background:linear-gradient(135deg,#c0392b,#922b21)!important;border-color:#ff6655!important}
    .gt-corrigir .tn{font-size:22px!important}
    .q-fiado{background:linear-gradient(145deg,#e23b35,#9c1717)!important}
    .gt-month{margin:10px 14px;padding:14px 16px;border-radius:16px;background:linear-gradient(145deg,#0b3856,#08283f);border:1px solid #ffffff22}
    .gt-month-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
    .gt-month-title{color:var(--gold);font-size:21px;font-weight:900}
    .gt-month-nav{border:0;border-radius:10px;padding:8px 11px;background:#153c58;color:#fff;font-weight:900}
    .gt-month-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:10px}
    .gt-month-stats div{background:#061b2b99;border:1px solid #ffffff16;border-radius:10px;padding:8px;font-size:12px}
    .gt-week{margin:10px 14px;border-radius:16px;background:#0c2c45;border:1px solid #ffffff20;overflow:hidden}
    .gt-week-h{padding:12px 14px;background:#123b5a;color:var(--gold);font-weight:900;display:flex;justify-content:space-between;gap:8px}
    .gt-day{padding:10px 12px;border-top:1px solid #ffffff12}
    .gt-day-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
    .gt-pencil{border:0;background:#ffffff12;color:#fff;border-radius:9px;padding:7px 10px;font-size:18px}
    .gt-day-lines{font-size:13px;color:#d5e4ef;margin-top:5px;line-height:1.5}
    .gt-fiado-client{margin:10px 14px;padding:14px;border-radius:16px;background:#102d42;border:1px solid #ffffff20}
    .gt-fiado-name{font-size:22px;font-weight:900;color:#fff}
    .gt-fiado-total{font-size:22px;font-weight:900;color:#ffca28}
    .gt-debt-line{padding:9px 0;border-top:1px solid #ffffff12;font-size:13px}
    .gt-debt-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}
    .gt-redbtn{border:0;border-radius:12px;padding:12px;background:#b52121;color:#fff;font-weight:900}
    .gt-greenbtn{border:0;border-radius:12px;padding:12px;background:#168d4b;color:#fff;font-weight:900}
    .gt-paid{opacity:.72}
  `;document.head.appendChild(st);

  window.abrirEscolhaFiltrado=function(nome){
    const p=produtos();
    if(excecoes.has(norm(nome))){window.gtPesoCur=10;telaQtd(nome,'filt',P_FILT[nome]);return}
    const u10=p.usa10?.[nome]!==false,u5=p.usa5?.[nome]===true,p5=Number(p.preco5?.[nome])||0;
    let h=`<div class="pg-hdr"><div class="pg-title">${esc(nome)}</div><div class="pg-sub">ESCOLHA O FILTRADO</div></div>`;
    if(u10)h+=`<button class="tipo-btn tp-filt" onclick="telaQtdPeso('${esc(nome)}',10,${Number(P_FILT[nome])||0})"><span class="tn">💎 FILTRADO 10 KG</span><span class="tp">${dinheiro(P_FILT[nome])}/saco</span></button>`;
    if(u5)h+=`<button class="tipo-btn tp-filt" onclick="telaQtdPeso('${esc(nome)}',5,${p5})"><span class="tn">💎 FILTRADO 5 KG</span><span class="tp">${p5>0?dinheiro(p5)+'/saco':'Configure o preço'}</span></button>`;
    if(!u10&&!u5)h+='<div class="conf-card">Nenhum tamanho de filtrado está ativado para este cliente.</div>';
    h+=`<button class="act-btn btn-back" onclick="telaVenda('${esc(nome)}')">‹ Voltar</button>`;abrirSub(h)
  };
  window.telaQtdPeso=function(nome,pesoKg,preco){if(!(Number(preco)>0))return toast('⚠ Configure o preço deste produto');window.gtPesoCur=pesoKg;nomeCur=nome;tipoCur='filt';precoCur=Number(preco);S.qtd=1;renderQtd()};

  telaVenda=function(nome){
    nomeCur=nome;window.gtPesoCur=null;
    const vs=S.vpc[nome]||[],fone=FONES[nome]||'',foneFmt=fone?'('+fone.slice(2,4)+') '+fone.slice(4,9)+'-'+fone.slice(9):'',t=tipoCliente(nome);
    const resumo=vs.filter(v=>v.tipo!=='obs').map(v=>v.qtd+'×'+(v.tipo==='esc'?'E':peso(v)===5?'F5':'F10')+'('+(v.pag==='PIX'?'P':v.pag==='Fiado'?'F':'D')+')').join('  ');
    abrirSub(`<div class="gt-client-actions"><div class="pg-hdr"><div class="pg-title">${esc(nome)}</div></div>
      ${fone?`<div style="text-align:center;margin:6px 14px 0;padding:10px 14px;background:rgba(0,0,0,.2);border-radius:10px;font-size:20px;color:#22ff99;font-weight:800">📞 ${foneFmt}</div>`:''}
      ${resumo?`<div class="vendas-hoje">Hoje: ${resumo}</div>`:''}
      ${t!=='filtrado'?`<button class="tipo-btn tp-esc" onclick="window.gtPesoCur=20;telaQtd('${esc(nome)}','esc',${Number(P_ESC[nome])||0})"><span class="tn">❄ ESCAMAS</span><span class="tp">${dinheiro(P_ESC[nome])}/saco</span></button>`:''}
      ${t!=='escamas'?`<button class="tipo-btn tp-filt" onclick="abrirEscolhaFiltrado('${esc(nome)}')"><span class="tn">💎 FILTRADO</span><span class="tp">${excecoes.has(norm(nome))?dinheiro(P_FILT[nome])+'/saco':'Escolher tamanho'}</span></button>`:''}
      <button class="tipo-btn tp-obs gt-corrigir" onclick="telaCorrecoesHoje('${esc(nome)}')"><span class="tn">✏️ CORRIGIR VENDA</span></button>
      <button class="act-btn btn-rel" onclick="telaHistoricoCliente('${esc(nome)}')">📊 HISTÓRICO</button>
      <button class="act-btn btn-back" onclick="fecharSub(true)">‹ Voltar</button></div>`)
  };

  window.telaCorrecoesHoje=function(nome){
    if(typeof salvarDiaNoHistorico==='function')salvarDiaNoHistorico();
    const ds=dias(),d=ds.find(x=>x.data===dataSimples()),vs=d?.vpc?.[nome]||[];
    let h=`<div class="pg-hdr"><div class="pg-title">CORRIGIR VENDA</div><div class="pg-sub">${esc(nome)} · hoje</div></div>`;
    if(!vs.length)h+='<div class="conf-card">Não há vendas deste cliente hoje.</div>';
    vs.forEach((v,i)=>{if(v.tipo!=='obs')h+=`<div class="gt-sale-row"><b>${produto(v)}</b> · ${v.qtd} saco(s) · ${v.pag} · ${dinheiro(v.valor)}<button class="act-btn btn-rel" style="margin:7px 0 0" onclick="editarVendaCliente('${esc(nome)}','${d.data}',${i})">✏️ Corrigir / excluir</button></div>`});
    h+=`<button class="act-btn btn-back" onclick="telaVenda('${esc(nome)}')">‹ Voltar</button>`;abrirSub(h)
  };

  let mesOffset=0;
  window.telaHistoricoCliente=function(nome,offset=mesOffset){
    if(typeof salvarDiaNoHistorico==='function')salvarDiaNoHistorico();
    mesOffset=Number(offset)||0;
    const alvo=new Date();alvo.setDate(1);alvo.setMonth(alvo.getMonth()+mesOffset);
    const km=keyMes(alvo),ds=dias().filter(d=>{const dt=parseData(d.data);return keyMes(dt)===km&&(d.vpc?.[nome]||[]).some(v=>v.tipo!=='obs')}).sort((a,b)=>parseData(a.data)-parseData(b.data));
    const total=zerado();ds.forEach(d=>soma(total,somaVendas(d.vpc[nome])));
    const t=tipoCliente(nome),showsE=t!=='filtrado',showsF=t!=='escamas';
    const weeks={};ds.forEach(d=>{const dt=parseData(d.data),start=inicioSemana(dt),k=dataBR(start);(weeks[k]||(weeks[k]={start,end:fimSemana(dt),dias:[]})).dias.push(d)});
    let h=`<div class="pg-hdr"><div class="pg-title">${esc(nome)}</div><div class="pg-sub">Histórico particular</div></div>
      <div class="gt-month"><div class="gt-month-head"><button class="gt-month-nav" onclick="telaHistoricoCliente('${esc(nome)}',${mesOffset-1})">‹</button><div class="gt-month-title">${mesNome(alvo)}</div><button class="gt-month-nav" onclick="telaHistoricoCliente('${esc(nome)}',${mesOffset+1})">›</button></div>
      <div class="gt-month-stats">${showsE?`<div>Escamas 20 kg<br><b>${total.esc} sacos</b></div>`:''}${showsF?`<div>Filtrado 10 kg<br><b>${total.f10} sacos</b></div><div>Filtrado 5 kg<br><b>${total.f5} sacos</b></div>`:''}<div>Total de sacos<br><b>${total.sacos}</b></div><div>Valor do mês<br><b>${dinheiro(total.valor)}</b></div><div>PIX<br><b>${dinheiro(total.pix)}</b></div><div>Dinheiro<br><b>${dinheiro(total.din)}</b></div><div>Fiado<br><b>${dinheiro(total.fiado)}</b></div></div></div>`;
    const wk=Object.values(weeks);
    if(!wk.length)h+='<div class="conf-card">Nenhuma venda deste cliente neste mês.</div>';
    wk.forEach((w,wi)=>{
      const wt=zerado();w.dias.forEach(d=>soma(wt,somaVendas(d.vpc[nome])));
      h+=`<div class="gt-week"><div class="gt-week-h"><span>SEMANA ${wi+1} · ${dataBR(w.start).slice(0,5)} a ${dataBR(w.end).slice(0,5)}</span><span>${wt.sacos} sacos · ${dinheiro(wt.valor)}</span></div>`;
      w.dias.forEach(d=>{
        const dt=parseData(d.data),dv=(d.vpc[nome]||[]).filter(v=>v.tipo!=='obs'),x=somaVendas(dv);
        const linhas=[];if(showsE&&x.esc)linhas.push('Escamas: '+x.esc);if(showsF&&x.f10)linhas.push('Filtrado 10 kg: '+x.f10);if(showsF&&x.f5)linhas.push('Filtrado 5 kg: '+x.f5);
        h+=`<div class="gt-day"><div class="gt-day-top"><div><b>${dt.toLocaleDateString('pt-BR',{weekday:'short'})} · ${d.data}</b> <span style="color:var(--gold)">${dinheiro(x.valor)}</span></div><button class="gt-pencil" onclick="telaDiaCliente('${esc(nome)}','${d.data}')">✏️</button></div><div class="gt-day-lines">${linhas.join(' · ')} · PIX ${dinheiro(x.pix)} · Dinheiro ${dinheiro(x.din)} · Fiado ${dinheiro(x.fiado)}</div></div>`
      });h+='</div>'
    });
    h+=`<button class="act-btn btn-back" onclick="telaVenda('${esc(nome)}')">‹ Voltar</button>`;abrirSub(h)
  };

  window.telaDiaCliente=function(nome,data){
    const ds=dias(),d=ds.find(x=>x.data===data),vs=d?.vpc?.[nome]||[];
    let h=`<div class="pg-hdr"><div class="pg-title">${esc(nome)}</div><div class="pg-sub">${data} · corrigir ou excluir</div></div>`;
    vs.forEach((v,i)=>{if(v.tipo!=='obs')h+=`<div class="gt-sale-row"><b>${produto(v)}</b> · ${v.qtd} saco(s) · ${v.pag} · ${dinheiro(v.valor)}<button class="act-btn btn-rel" style="margin:7px 0 0" onclick="editarVendaCliente('${esc(nome)}','${data}',${i})">✏️ Corrigir / excluir</button></div>`});
    h+=`<button class="act-btn btn-back" onclick="telaHistoricoCliente('${esc(nome)}',${mesOffset})">‹ Voltar</button>`;abrirSub(h)
  };

  // mantém correções sincronizadas sem transformar pagamento de dívida em nova venda
  const oldSalvar=window.salvarCorrecaoVenda;
  window.salvarCorrecaoVenda=function(nome,data,idx){
    const ds=dias(),d=ds.find(x=>x.data===data),v=d?.vpc?.[nome]?.[idx];if(!v)return;
    const prod=document.getElementById('gt-ed-prod')?.value,q=Number(document.getElementById('gt-ed-qtd')?.value)||0,val=Number(document.getElementById('gt-ed-val')?.value)||0,pag=document.getElementById('gt-ed-pag')?.value;
    if(q<1||val<0)return toast('⚠ Confira quantidade e valor');
    v.tipo=prod==='esc'?'esc':'filt';v.pesoKg=prod==='f5'?5:prod==='f10'?10:20;v.qtd=q;v.valor=val;v.pag=pag;recalcularDia(d);saveDias(ds);syncHoje(d);toast('✓ Venda corrigida');telaDiaCliente(nome,data)
  };
  window.excluirVendaCliente=function(nome,data,idx){
    confirmar('Excluir venda?','Esta venda será removida e os totais serão recalculados.','Sim, excluir',()=>{const ds=dias(),d=ds.find(x=>x.data===data);if(!d?.vpc?.[nome])return;d.vpc[nome].splice(idx,1);recalcularDia(d);saveDias(ds);syncHoje(d);toast('🗑 Venda excluída');telaDiaCliente(nome,data)})
  };

  function dividasCliente(nome){
    const linhas=[];let total=0;
    dias().forEach(d=>(d.vpc?.[nome]||[]).forEach((v,i)=>{if(v.tipo!=='obs'&&v.pag==='Fiado'){const val=Number(v.valor)||0;total+=val;linhas.push({data:d.data,produto:produto(v),qtd:Number(v.qtd)||0,valor:val})}}));
    const pgs=pagamentos().filter(p=>p.cliente===nome),pago=pgs.reduce((a,p)=>a+(Number(p.valor)||0),0);
    return{linhas,total,pago,saldo:Math.max(0,total-pago),pagamentos:pgs}
  }
  window.telaFiado=function(){
    if(typeof salvarDiaNoHistorico==='function')salvarDiaNoHistorico();
    const abertas=[],pagas=[];CLIENTES.forEach(n=>{const d=dividasCliente(n);if(d.total>0)(d.saldo>0?abertas:pagas).push({nome:n,...d})});
    const total=abertas.reduce((a,x)=>a+x.saldo,0);
    let h=`<div class="pg-hdr"><div class="pg-title">📕 FIADO</div><div class="pg-sub">Caderno dos clientes</div></div><div class="gt-month"><div class="gt-month-title">TOTAL A RECEBER: ${dinheiro(total)}</div><div class="gt-mini">${abertas.length} cliente(s) com saldo em aberto</div></div>`;
    if(!abertas.length)h+='<div class="conf-card">Nenhuma dívida em aberto.</div>';
    abertas.forEach(x=>{
      h+=`<div class="gt-fiado-client"><div style="display:flex;justify-content:space-between;gap:8px"><div class="gt-fiado-name">${esc(x.nome)}</div><div class="gt-fiado-total">${dinheiro(x.saldo)}</div></div>`;
      x.linhas.forEach(l=>h+=`<div class="gt-debt-line">${l.data} · ${l.produto} · ${l.qtd} saco(s) · ${dinheiro(l.valor)}</div>`);
      if(x.pago>0)h+=`<div class="gt-debt-line" style="color:#63e69a">Pagamentos já registrados: −${dinheiro(x.pago)}</div>`;
      h+=`<div class="gt-debt-actions"><button class="gt-greenbtn" onclick="abrirBaixaFiado('${esc(x.nome)}')">💵 Registrar pagamento</button><button class="gt-redbtn" onclick="quitarFiado('${esc(x.nome)}')">✓ Marcar tudo pago</button></div></div>`
    });
    if(pagas.length){h+='<div class="sec-title" style="margin:18px 14px 6px">PAGOS</div>';pagas.forEach(x=>h+=`<div class="gt-fiado-client gt-paid"><div class="gt-fiado-name">${esc(x.nome)}</div><div>Quitado · histórico preservado · total ${dinheiro(x.total)}</div></div>`)}
    h+='<button class="act-btn btn-back" onclick="fecharSub(true)">‹ Voltar</button>';abrirSub(h)
  };
  window.abrirBaixaFiado=function(nome){
    const d=dividasCliente(nome);abrirSub(`<div class="pg-hdr"><div class="pg-title">${esc(nome)}</div><div class="pg-sub">Baixa do fiado · saldo ${dinheiro(d.saldo)}</div></div><label>Valor recebido</label><input id="gt-pag-fiado" class="inp" type="number" step="0.01" min="0.01" max="${d.saldo}" value="${d.saldo.toFixed(2)}"><label>Forma recebida</label><select id="gt-pag-metodo" class="inp"><option>Dinheiro</option><option>PIX</option></select><button class="btn-confirm" onclick="salvarBaixaFiado('${esc(nome)}')">REGISTRAR PAGAMENTO</button><button class="act-btn btn-back" onclick="telaFiado()">‹ Voltar</button>`)
  };
  window.salvarBaixaFiado=function(nome){
    const d=dividasCliente(nome),v=Number(document.getElementById('gt-pag-fiado')?.value)||0,m=document.getElementById('gt-pag-metodo')?.value||'Dinheiro';if(v<=0||v>d.saldo+.001)return toast('⚠ Confira o valor');
    const ps=pagamentos();ps.push({cliente:nome,data:dataSimples(),valor:v,metodo:m,ts:Date.now()});savePag(ps);toast('✓ Pagamento registrado sem criar nova venda');telaFiado()
  };
  window.quitarFiado=function(nome){const d=dividasCliente(nome);if(!(d.saldo>0))return;confirmar('Marcar como pago?',nome+' será retirado das dívidas em aberto. O histórico ficará guardado.','Sim, pago',()=>{const ps=pagamentos();ps.push({cliente:nome,data:dataSimples(),valor:d.saldo,metodo:'Quitação',ts:Date.now()});savePag(ps);toast('✓ Dívida quitada');telaFiado()})};

  // 4 atalhos no topo, com caderno vermelho
  telaClientes=function(restore=false){
    const div=C();
    div.innerHTML=`<div class="quick-grid">
      <button class="quick-btn q-import" onclick="telaImportarWhatsApp()"><span class="qi">📥</span>Importar</button>
      <button class="quick-btn q-inbox" onclick="telaVendasRecebidas()"><span class="qi">💬</span>Recebidas</button>
      <button class="quick-btn q-report" onclick="telaRelatorio()"><span class="qi">▥</span>Relatório</button>
      <button class="quick-btn q-fiado" onclick="telaFiado()"><span class="qi">📕</span>Fiado</button>
    </div><div class="sec-title">Clientes</div>`;
    CLIENTES.forEach(nome=>{const done=S.atendidos.has(nome),vs=S.vpc[nome]||[],ts=vs.reduce((a,v)=>a+(v.tipo!=='obs'?(Number(v.qtd)||0):0),0),tv=vs.reduce((a,v)=>a+(Number(v.valor)||0),0),b=document.createElement('button');b.className='cli-btn '+(done?'done':'norm');b.innerHTML='<span style="flex:1">'+esc(nome)+'</span>'+(done?'<span class="cli-badge">✓ '+ts+' — '+dinheiro(tv)+'</span>':'')+'<span class="cli-arrow">›</span>';b.onclick=()=>{scrollPos=b.offsetTop-30;telaVenda(nome)};div.appendChild(b)});
    div.insertAdjacentHTML('beforeend','<div class="divider"></div>');addBtn(div,'DESPESAS: −'+dinheiro(S.desp),'act-btn btn-desp',telaDespesas);addBtn(div,'RELATÓRIO DO DIA','act-btn btn-rel',telaConferencia);addBtn(div,'📋 HISTÓRICO DO DIA','act-btn btn-back',telaHistorico);addBtn(div,'⚙️ CONFIGURAÇÕES','act-btn btn-back',telaConfiguracoes);addBtn(div,'REINICIAR TUDO','act-btn btn-reset',()=>confirmar('Reiniciar o dia?','Todos os dados do dia serão apagados. O histórico salvo permanece.','Sim, reiniciar',()=>{S={esc:0,filt:0,caixa:0,pix:0,din:0,desp:0,fiad:0,vpc:{},despDia:[],atendidos:new Set(),ultima:null,qtd:1};salvarEstado();salvarDiaNoHistorico();updHdr();telaClientes();toast('✓ Novo dia!')}));if(restore&&scrollPos>0)setTimeout(()=>{div.scrollTop=scrollPos},60)
  };
})();