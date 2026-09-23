/* Assistente Gelo Tutóia: comandos locais, com confirmação antes de gravar. */
(()=>{
  const css=`
    #gt-agent-open{position:fixed;right:14px;bottom:calc(var(--nav-h, 72px) + 14px);z-index:110;border:0;border-radius:28px;padding:12px 17px;background:#0a93d5;color:white;font-weight:800;box-shadow:0 5px 18px #0008}
    #gt-agent{display:none;position:fixed;inset:0;z-index:180;background:#061422;color:white;padding:20px 16px;overflow:auto;box-sizing:border-box}
    #gt-agent.gt-show{display:block}#gt-agent-inner{max-width:480px;margin:auto}
    #gt-agent h2{margin:4px 0 12px}#gt-agent p{line-height:1.5}
    #gt-agent-reply{background:#103550;border:1px solid #3e7595;border-radius:14px;padding:15px;margin:15px 0;white-space:pre-wrap;line-height:1.55}
    #gt-agent input{box-sizing:border-box;width:100%;font:inherit;color:#102638;padding:14px;border-radius:12px;border:0}
    #gt-agent .gt-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
    #gt-agent button{border:0;border-radius:12px;padding:12px 15px;background:#167bc2;color:white;font-weight:700;font:inherit}
    #gt-agent button:disabled{opacity:.5}#gt-agent .gt-quiet{background:#234255}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const open=document.createElement('button');open.id='gt-agent-open';open.type='button';open.textContent='✦ Assistente';document.body.appendChild(open);
  const panel=document.createElement('section');panel.id='gt-agent';panel.setAttribute('aria-label','Assistente Gelo Tutóia');
  panel.innerHTML=`<div id="gt-agent-inner"><button type="button" id="gt-agent-close" class="gt-quiet">← Voltar</button><h2>Assistente Gelo Tutóia</h2><p>Diga uma venda, uma despesa, “resumo do dia” ou “desfazer última venda”. Confirme cada lançamento antes de salvar.</p><div id="gt-agent-reply" role="status">Como posso ajudar, Cláudio?</div><form id="gt-agent-form"><input id="gt-agent-input" autocomplete="off" aria-label="Mensagem" placeholder="Ex.: Marcelo 1, dois filtrados, PIX"><div class="gt-row"><button type="submit">Enviar</button><button type="button" id="gt-agent-mic" class="gt-quiet">🎙️ Falar</button></div></form><div id="gt-agent-actions" class="gt-row"></div></div>`;
  document.body.appendChild(panel);
  const input=panel.querySelector('#gt-agent-input'),reply=panel.querySelector('#gt-agent-reply'),actions=panel.querySelector('#gt-agent-actions');
  function dizer(t){reply.textContent=t;actions.replaceChildren()}
  function acao(rotulo,fn){const b=document.createElement('button');b.type='button';b.textContent=rotulo;b.addEventListener('click',fn);actions.appendChild(b)}
  open.addEventListener('click',()=>{panel.classList.add('gt-show');input.focus()});
  panel.querySelector('#gt-agent-close').addEventListener('click',()=>panel.classList.remove('gt-show'));

  function resumo(){
    const bruto=S.din+S.pix+S.fiad;
    dizer(`Fechamento de ${dataSimples()}\n❄️ Escamas: ${S.esc} sacos\n💎 Filtrado: ${S.filt} sacos\n📦 Total: ${S.esc+S.filt} sacos\n💵 Dinheiro: ${fmt(S.din)}\n📱 PIX: ${fmt(S.pix)}\n💳 A receber: ${fmt(S.fiad)}\nVendas: ${fmt(bruto)}\nSaídas: ${fmt(S.desp)}\nLíquido: ${fmt(bruto-S.desp)}\nRecebido após saídas: ${fmt(S.din+S.pix-S.desp)}`);
  }
  function tipoHabitual(nome){
    try{const cfg=JSON.parse(localStorage.getItem('gelo_tutoia_cliente_meta_v1')||'{}');return cfg[nome]?.tipo||null}
    catch(e){return null}
  }
  function interpretarVendaLocal(frase){
    const n=textoComNumeros(frase).replace(/\b(comum|comuns)\b/g,'escamas'),cliente=acharClienteNaLinha(frase);
    if(!cliente)return {erro:'Qual é o cliente? Diga o nome como aparece na lista.'};
    const semNome=n.replace(normalizarTxt(cliente),' ').replace(/\b\d{1,3}\b(?=\s*(?:reais|real|r\$))/g,'');
    const valorQtd=semNome.match(/\b\d{1,3}\b/g)||[];
    if(!valorQtd.length)return {erro:'Quantos sacos foram vendidos?'};
    const temF=/\b(filtrado|filtrados|filtrada|filtradas|filt)\b/.test(n);
    const temE=/\b(escama|escamas|comum|comuns|esc)\b/.test(n);
    const habitual=tipoHabitual(cliente);
    if(!temF&&!temE&&habitual!=='escamas'&&habitual!=='filtrado')return {erro:'Foi gelo de escamas ou filtrado?'};
    const pag=/\bpix\b/.test(n)?'PIX':/\b(fiado|a receber|pagar depois|nao pagou)\b/.test(n)?'Fiado':/\b(pagou|pago|dinheiro|recebido)\b/.test(n)?'Dinheiro':'Fiado';
    let qE=temE?extrairQtdPorTipo(semNome,'esc'):0,qF=temF?extrairQtdPorTipo(semNome,'filt'):0;
    if(temE&&!qE||temF&&!qF)return {erro:'Diga a quantidade junto do produto, por exemplo: 2 escamas e 1 filtrado.'};
    if(!temE&&!temF){const nums=semNome.match(/\b\d{1,3}\b/g)||[];if(nums.length!==1)return {erro:'Diga uma quantidade de sacos.'};const q=Number(nums[0]);if(habitual==='filtrado')qF=q;else qE=q}
    if(qE+qF<1||qE+qF>200)return {erro:'Confira a quantidade de sacos e tente de novo.'};
    const itens=[];for(const [tipo,qtd] of [['esc',qE],['filt',qF]])if(qtd){const preco=precoVendaRemota(cliente,tipo);itens.push({cliente,tipo,qtd,pag,preco,valor:qtd*preco})}
    return {itens,pag};
  }
  function processar(frase){
    const t=normalizarTxt(frase);
    if(!t){dizer('Escreva ou fale um comando.');return}
    if(/\b(resumo|fechamento|total do dia|quanto vendi)\b/.test(t)){resumo();return}
    if(/\b(desfazer|cancelar ultima venda)\b/.test(t)){
      if(!S.ultima){dizer('Não há última venda para desfazer.');return}
      const u=S.ultima;dizer(`Desfazer a última venda de ${u.nome}, ${u.qtd} saco(s), ${fmt(u.valor)}?`);
      acao('Confirmar desfazer',()=>{desfazer();salvarDiaNoHistorico();dizer('Última venda desfeita.')});acao('Manter venda',()=>dizer('Venda mantida.'));return;
    }
    if(/\b(despesa|gastei|saida|gnv|etanol|lanche|ajudante|acai|mercado|uber)\b/.test(t)){
      const valor=frase.match(/(?:r\$\s*)?(\d+(?:[,.]\d{1,2})?)\s*(?:reais|real)?\s*$/i);
      const quantia=valor?Number(valor[1].replace(',','.')):0;
      const descricao=frase.replace(/\b(despesa|gastei|sa[ií]da)\b/ig,'').replace(/(?:r\$\s*)?\d+(?:[,.]\d{1,2})?\s*(?:reais|real)?\s*$/i,'').trim();
      if(!descricao||!(quantia>0)){dizer('Diga a descrição e o valor. Exemplo: despesa GNV 30 reais.');return}
      dizer(`Registrar despesa de ${descricao}: ${fmt(quantia)}?`);
      acao('Confirmar despesa',()=>{regDesp(descricao,quantia);dizer('Despesa registrada no fechamento de hoje.')});acao('Cancelar',()=>dizer('Despesa não registrada.'));return;
    }
    const proposta=interpretarVendaLocal(frase);
    if(proposta.erro){dizer(proposta.erro);return}
    const itens=proposta.itens;
    dizer(`Confira a venda de ${itens[0].cliente}:\n${itens.map(v=>`${v.qtd} saco(s) de ${v.tipo==='esc'?'escamas':'filtrado'} a ${fmt(v.preco)} = ${fmt(v.valor)}`).join('\n')}\nPagamento: ${proposta.pag==='Fiado'?'a receber':proposta.pag}.\nTotal: ${fmt(itens.reduce((a,v)=>a+v.valor,0))}`);
    acao('Confirmar venda',()=>{
      for(const v of itens)lancarRecebidaNoDia({...v,hora:horaAgora()});
      salvarEstado();salvarDiaNoHistorico();updHdr();telaClientes(true);
      dizer('Venda registrada no movimento de hoje.');
    });acao('Corrigir',()=>{dizer('Digite a venda novamente com os dados corrigidos.');input.focus()});
  }
  panel.querySelector('#gt-agent-form').addEventListener('submit',e=>{e.preventDefault();const frase=input.value;input.value='';processar(frase)});
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const mic=panel.querySelector('#gt-agent-mic');
  if(!SpeechRecognition){mic.hidden=true}else mic.addEventListener('click',()=>{
    const rec=new SpeechRecognition();rec.lang='pt-BR';rec.interimResults=false;
    mic.disabled=true;dizer('Ouvindo...');rec.onresult=e=>{input.value=e.results[0][0].transcript;processar(input.value);input.value=''};
    rec.onerror=()=>dizer('Não consegui ouvir. Você pode digitar a venda.');rec.onend=()=>{mic.disabled=false};rec.start();
  });
})();
