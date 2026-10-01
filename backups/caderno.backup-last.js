/* Gelo Tutóia - Caderno de Vendas */
(()=>{
  const KEY='gelo_tutoia_caderno_v1';
  const esc=s=>typeof escHtml==='function'?escHtml(String(s||'')):String(s||'');
  const dinheiro=n=>typeof fmt==='function'?fmt(Number(n)||0):('R$ '+(Number(n)||0).toFixed(2).replace('.',','));
  const clone=v=>JSON.parse(JSON.stringify(v));
  function ler(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return[]}}
  function salvar(v){localStorage.setItem(KEY,JSON.stringify(v))}
  function totais(vpc){
    const t={esc:0,filt:0,din:0,pix:0,fiado:0,revisar:0,valor:0,sacos:0};
    Object.values(vpc||{}).forEach(vs=>(vs||[]).forEach(v=>{
      if(v.tipo==='obs')return;
      const q=Number(v.qtd)||0,val=Number(v.valor)||0;
      t.sacos+=q;t.valor+=val;
      if(v.tipo==='esc')t.esc+=q;else if(v.tipo==='filt')t.filt+=q;
      if(v.pag==='PIX')t.pix+=val;else if(v.pag==='Fiado')t.fiado+=val;else if(v.pag==='Dinheiro')t.din+=val;else t.revisar+=val;
    }));
    return t;
  }
  function snapshotHoje(){
    if(typeof salvarDiaNoHistorico==='function')salvarDiaNoHistorico();
    const vpc=clone(S.vpc||{}),t=totais(vpc);
    return Object.assign({data:dataSimples(),fechadoEm:new Date().toISOString(),vpc:vpc,desp:Number(S.desp)||0,despDia:clone(S.despDia||[])},t);
  }
  window.fecharDiaNoCaderno=function(){
    const snap=snapshotHoje(),livro=ler(),idx=livro.findIndex(x=>x.data===snap.data);
    if(idx>=0)livro[idx]=snap;else livro.push(snap);
    salvar(livro);
    toast(idx>=0?'✓ Caderno de hoje atualizado':'✓ Dia salvo no Caderno de Vendas');
    telaCadernoVendas();
  };
  function vendasDo(d,nome){return (d.vpc&&d.vpc[nome]||[]).filter(v=>v.tipo!=='obs')}
  function resumo(v){
    const prod=v.tipo==='esc'?'Escamas':v.tipo==='filt'?(v.pesoKg===5?'Filtrado 5 kg':'Filtrado'):'Obs.';
    return (Number(v.qtd)||0)+'x '+prod+' · '+(v.pag||'Não informado')+' · '+dinheiro(v.valor);
  }
  function topo(titulo,sub){
    return '<div class="pg-hdr"><div class="pg-title">'+titulo+'</div><div class="pg-sub">'+(sub||'')+'</div></div>'+
      '<div class="gt-cad-tabs"><button onclick="telaCadernoVendas()">POR DIA</button><button onclick="telaCadernoClientes()">POR CLIENTE</button></div>';
  }
  window.telaCadernoVendas=function(){
    const livro=ler().slice().reverse();
    let h=topo('📒 CADERNO DE VENDAS','Fechamentos confirmados do dia');
    if(!livro.length)h+='<div class="conf-card">Nenhum dia fechado ainda. Abra o Relatório do Dia e toque em FECHAR DIA NO CADERNO.</div>';
    livro.forEach(d=>{
      const pend=Number(d.revisar)||0;
      h+='<button class="gt-cad-day" onclick="telaCadernoDia(\''+esc(d.data)+'\')"><b>'+esc(d.data)+'</b><span>'+(d.sacos||0)+' sacos · '+dinheiro(d.valor||0)+'</span><small>Dinheiro '+dinheiro(d.din||0)+' · PIX '+dinheiro(d.pix||0)+' · Fiado '+dinheiro(d.fiado||0)+(pend>0?' · ⚠ Revisar '+dinheiro(pend):'')+'</small></button>';
    });
    h+='<button class="act-btn btn-back" onclick="fecharSub(true)">‹ Voltar</button>';abrirSub(h);
  };
  window.telaCadernoDia=function(data){
    const d=ler().find(x=>x.data===data);if(!d)return;
    let h=topo('📒 '+esc(data),'Vendas fechadas neste dia');
    Object.keys(d.vpc||{}).filter(n=>vendasDo(d,n).length).forEach(nome=>{
      const vs=vendasDo(d,nome),total=vs.reduce((a,v)=>a+(Number(v.valor)||0),0);
      h+='<div class="gt-cad-card"><div class="gt-cad-name">'+esc(nome)+' <span>'+dinheiro(total)+'</span></div>'+vs.map(v=>'<div class="gt-cad-line">'+esc(resumo(v))+'</div>').join('')+'</div>';
    });
    h+='<div class="gt-cad-total"><b>Total do dia: '+dinheiro(d.valor||0)+'</b><br>Escamas: '+(d.esc||0)+' · Filtrado: '+(d.filt||0)+' · Sacos: '+(d.sacos||0)+'<br>Despesas: '+dinheiro(d.desp||0)+'</div>';
    h+='<button class="act-btn btn-back" onclick="telaCadernoVendas()">‹ Voltar</button>';abrirSub(h);
  };
  window.telaCadernoClientes=function(){
    const livro=ler(),nomes=[...new Set(livro.flatMap(d=>Object.keys(d.vpc||{})))].filter(n=>livro.some(d=>vendasDo(d,n).length)).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    let h=topo('👥 CADERNO POR CLIENTE','Histórico separado para cada cliente');
    if(!nomes.length)h+='<div class="conf-card">Ainda não há clientes em dias fechados.</div>';
    nomes.forEach(nome=>{
      let sacos=0,total=0;livro.forEach(d=>vendasDo(d,nome).forEach(v=>{sacos+=Number(v.qtd)||0;total+=Number(v.valor)||0}));
      h+='<button class="gt-cad-day" onclick="telaCadernoCliente(\''+esc(nome)+'\')"><b>'+esc(nome)+'</b><span>'+sacos+' sacos · '+dinheiro(total)+'</span></button>';
    });
    h+='<button class="act-btn btn-back" onclick="fecharSub(true)">‹ Voltar</button>';abrirSub(h);
  };
  window.telaCadernoCliente=function(nome){
    const livro=ler().slice().reverse().filter(d=>vendasDo(d,nome).length);
    let total=0,sacos=0,h=topo(esc(nome),'Histórico particular no Caderno');
    livro.forEach(d=>{
      const vs=vendasDo(d,nome),val=vs.reduce((a,v)=>a+(Number(v.valor)||0),0),q=vs.reduce((a,v)=>a+(Number(v.qtd)||0),0);total+=val;sacos+=q;
      h+='<div class="gt-cad-card"><div class="gt-cad-name">'+esc(d.data)+' <span>'+q+' sacos · '+dinheiro(val)+'</span></div>'+vs.map(v=>'<div class="gt-cad-line">'+esc(resumo(v))+'</div>').join('')+'</div>';
    });
    h+='<div class="gt-cad-total"><b>Total registrado: '+sacos+' sacos · '+dinheiro(total)+'</b></div><button class="act-btn btn-back" onclick="telaCadernoClientes()">‹ Voltar</button>';abrirSub(h);
  };
  const style=document.createElement('style');
  style.textContent='.gt-cad-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 14px}.gt-cad-tabs button{border:1px solid #ffffff28;border-radius:12px;padding:12px;background:#123b5a;color:#fff;font-weight:900}.gt-cad-day{display:flex;width:calc(100% - 28px);margin:9px 14px;padding:15px;flex-direction:column;gap:4px;text-align:left;border:1px solid #ffffff24;border-radius:16px;background:#0d3450;color:#fff}.gt-cad-day b{font-size:20px;color:#ffd54f}.gt-cad-day span{font-size:16px;font-weight:800}.gt-cad-day small{color:#c9dbe8}.gt-cad-card{margin:10px 14px;padding:13px;border-radius:15px;background:#0c2c45;border:1px solid #ffffff20}.gt-cad-name{display:flex;justify-content:space-between;gap:8px;font-size:19px;font-weight:900;color:#ffd54f}.gt-cad-name span{color:#36e27f}.gt-cad-line{padding-top:7px;color:#e3edf4}.gt-cad-total{margin:12px 14px;padding:15px;border-radius:15px;background:#103b2b;color:#eafff2;line-height:1.6}';
  document.head.appendChild(style);
  function adicionarInicio(){
    try{
      const div=C();if(!div||div.querySelector('#gt-caderno-btn'))return;
      const b=document.createElement('button');b.id='gt-caderno-btn';b.className='act-btn btn-rel';b.textContent='📒 CADERNO DE VENDAS';b.onclick=telaCadernoVendas;
      const cfg=[...div.querySelectorAll('button')].find(x=>/CONFIGURAÇÕES/i.test(x.textContent||''));if(cfg)div.insertBefore(b,cfg);else div.appendChild(b);
    }catch(e){}
  }
  const tc=telaClientes;telaClientes=function(...args){const r=tc.apply(this,args);setTimeout(adicionarInicio,0);return r};
  function adicionarFechamento(){
    try{
      const sub=typeof S2==='function'?S2():null,alvo=sub&&sub.classList.contains('ativa')?sub:C();
      if(!alvo||alvo.querySelector('#gt-fechar-caderno'))return;
      const b=document.createElement('button');b.id='gt-fechar-caderno';b.className='act-btn btn-confirm';b.textContent='✅ FECHAR DIA NO CADERNO';b.onclick=fecharDiaNoCaderno;alvo.appendChild(b);
    }catch(e){}
  }
  if(typeof telaRelatorio==='function'){const tr=telaRelatorio;telaRelatorio=function(...args){const r=tr.apply(this,args);setTimeout(adicionarFechamento,0);return r}}
  if(typeof telaConferencia==='function'){const tr2=telaConferencia;telaConferencia=function(...args){const r=tr2.apply(this,args);setTimeout(adicionarFechamento,0);return r}}
  setTimeout(adicionarInicio,80);
})();