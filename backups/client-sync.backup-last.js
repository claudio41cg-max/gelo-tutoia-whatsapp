/* Gelo Tutóia - clientes dinâmicos + badges de produto/pagamento */
(()=>{
  const API='https://gelo-tutoia-whatsapp.claudio41cg.workers.dev';
  const META_KEY='gelo_tutoia_cliente_meta_v1';
  const soFilt=['Marcelo 1','Marcelo 2','Tia','Sr. Gilson','Sou JOY','Café','Angélica'];
  const soEsc=['Padaria BMG','Alex Rua 22','Peixaria Ronald','Peixaria Tiago','Peixaria Pará','Alex Campinho','Marcão','Márcio','Alex Laranja','Chop Feira','Churrasco Cosmos','Luiz Peixaria','Padaria Paciência','Lilian','Churrasco 1 L','Bruno','Chatuba','Churrasco 2 T','Peixaria Bacaxá','Custódio','Gelo 22','Jonny Feira'];
  const apelidos={
    'Sou JOY':['Joy','Joi','Restaurante Joy','Restaurante Joi'],
    'Café':['Loja do Café','Barraca do Café','Cafeteria'],
    'Angélica':['Barraca da Angélica','Aqui na Angélica','Barraca de caldo da Angélica','Barraca de caldo de cana da Angélica'],
    'Sr. Gilson':['Seu Gilson','Senhor Gilson','Rango Mineiro'],
    'Alex Rua 22':['Perninha','Alex Perninha','Alex 22'],
    'Peixaria Bacaxá':['Jorge','Seu Jorge','Abacaxi'],
    'Custódio':['Escorinho','Peixaria do Escorinho'],
    'Jonny Feira':['Joni Feira','Jonne Feira','Abelha','Cara da Feira'],
    'Bruno':['Peixaria Bruno','Encanamento','Peixaria Encanamento']
  };
  let meta={};try{meta=JSON.parse(localStorage.getItem(META_KEY)||'{}')}catch(e){}
  function tipo(n){return meta[n]?.tipo||(soFilt.includes(n)?'filtrado':soEsc.includes(n)?'escamas':'ambos')}
  function tipoLabel(n){const t=tipo(n);return t==='filtrado'?'FILTRADO':t==='escamas'?'ESCAMA':'AMBOS'}
  function ensure(nome,after,pe,pf){
    if(!CLIENTES.includes(nome)){const i=CLIENTES.indexOf(after);CLIENTES.splice(i>=0?i+1:CLIENTES.length,0,nome)}
    if(pe>0)P_ESC[nome]=pe;if(pf>0)P_FILT[nome]=pf;
    meta[nome]={tipo:tipo(nome),apelidos:meta[nome]?.apelidos||apelidos[nome]||[]};
  }
  ensure('Sou JOY','Alex Campinho',12,12);ensure('Café','Lilian',12,12);ensure('Angélica','Churrasco 2 T',13,13);
  for(const n of CLIENTES)meta[n]={tipo:tipo(n),apelidos:meta[n]?.apelidos||apelidos[n]||[]};
  localStorage.setItem(META_KEY,JSON.stringify(meta));
  async function sync(){
    try{await fetch(API+'/api/clientes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientes:CLIENTES.map(nome=>({nome,preco_esc:Number(P_ESC[nome])||0,preco_filt:Number(P_FILT[nome])||0,tipo:tipo(nome),apelidos:meta[nome]?.apelidos||[]}))})})}catch(e){}
  }
  function pagamentoResumo(nome){
    const vs=S?.vpc?.[nome]||[];
    const pags=[...new Set(vs.filter(v=>v.tipo!=='obs').map(v=>v.pag||'Dinheiro'))];
    if(!pags.length)return '';
    if(pags.length>1)return 'MISTO';
    const p=pags[0];
    return p==='PIX'?'PIX':p==='Fiado'?'FIADO':'DINHEIRO';
  }
  function decorarClientes(){
    const botoes=[...document.querySelectorAll('.cli-btn')];
    botoes.forEach((btn,i)=>{
      const nome=CLIENTES[i]; if(!nome)return;
      let tag=btn.querySelector('.tipo-gelo-tag');
      if(!tag){
        tag=document.createElement('span');tag.className='tipo-gelo-tag';
        const nomeSpan=btn.querySelector('span[style*="flex:1"]')||btn.firstElementChild;
        if(nomeSpan)nomeSpan.appendChild(tag);
      }
      tag.textContent=tipoLabel(nome);
      const badge=btn.querySelector('.cli-badge');
      if(badge){
        const vs=S?.vpc?.[nome]||[];
        const totalValor=vs.reduce((a,v)=>a+(Number(v.valor)||0),0);
        const pag=pagamentoResumo(nome);
        badge.textContent='✓ '+fmt(totalValor)+(pag?' • '+pag:'');
      }
    });
  }
  try{
    const oldSalvar=salvarConfig;
    salvarConfig=function(){const r=oldSalvar.apply(this,arguments);for(const n of CLIENTES)if(!meta[n])meta[n]={tipo:'ambos',apelidos:[]};for(const n of Object.keys(meta))if(!CLIENTES.includes(n))delete meta[n];localStorage.setItem(META_KEY,JSON.stringify(meta));sync();setTimeout(decorarClientes,20);return r};
  }catch(e){}
  try{
    const oldVenda=telaVenda;
    telaVenda=function(nome){const r=oldVenda.apply(this,arguments);setTimeout(()=>{const t=tipo(nome);if(t==='filtrado')document.querySelector('.tp-esc')?.remove();if(t==='escamas')document.querySelector('.tp-filt')?.remove()},0);return r};
  }catch(e){}
  try{
    const oldClientes=telaClientes;
    telaClientes=function(){const r=oldClientes.apply(this,arguments);setTimeout(decorarClientes,0);return r};
  }catch(e){}
  try{salvarConfig()}catch(e){sync()}
  setTimeout(()=>{try{telaClientes();decorarClientes()}catch(e){}},100);
})();
