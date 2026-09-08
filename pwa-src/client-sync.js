/* Gelo Tutóia - clientes dinâmicos + visual de alta nitidez */
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
  try{
    const oldSalvar=salvarConfig;
    salvarConfig=function(){const r=oldSalvar.apply(this,arguments);for(const n of CLIENTES)if(!meta[n])meta[n]={tipo:'ambos',apelidos:[]};for(const n of Object.keys(meta))if(!CLIENTES.includes(n))delete meta[n];localStorage.setItem(META_KEY,JSON.stringify(meta));sync();return r};
  }catch(e){}
  try{
    const oldVenda=telaVenda;
    telaVenda=function(nome){const r=oldVenda.apply(this,arguments);setTimeout(()=>{const t=tipo(nome);if(t==='filtrado')document.querySelector('.tp-esc')?.remove();if(t==='escamas')document.querySelector('.tp-filt')?.remove()},0);return r};
  }catch(e){}
  try{salvarConfig()}catch(e){sync()}
  setTimeout(()=>{try{telaClientes()}catch(e){}},100);
})();
