(()=>{
'use strict';

const state={
  pc:null,stream:null,channel:null,audio:null,
  running:false,starting:false,muted:false,
  onTranscript:null,onState:null
};

function emit(name,detail){
  try{state.onState&&state.onState(name,detail)}catch(e){}
  try{window.dispatchEvent(new CustomEvent('gelo-gpt-live-state',{detail:{name,detail}}))}catch(e){}
}
function waitIce(pc){
  if(pc.iceGatheringState==='complete')return Promise.resolve();
  return new Promise(resolve=>{
    const timer=setTimeout(resolve,5000);
    const on=()=>{
      if(pc.iceGatheringState!=='complete')return;
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange',on);
      resolve();
    };
    pc.addEventListener('icegatheringstatechange',on);
  });
}
function sendEvent(event){
  if(!state.channel||state.channel.readyState!=='open')return false;
  try{state.channel.send(JSON.stringify(event));return true}catch(e){return false}
}
function parseEvent(raw){
  let ev;try{ev=JSON.parse(String(raw||''))}catch(e){return}
  const type=String(ev&&ev.type||'');
  if(type==='input_audio_buffer.speech_started'){emit('user-speaking');return}
  if(type==='input_audio_buffer.speech_stopped'){emit('user-stopped');return}
  if(type==='response.output_audio.delta'||type==='response.audio.delta'){emit('assistant-speaking');return}
  if(type==='response.output_audio.done'||type==='response.audio.done'){emit('assistant-done');return}
  if(type==='turn.done'){
    const role=ev&&ev.turn&&ev.turn.role;
    const text=String(ev&&ev.turn&&ev.turn.transcript||'').trim();
    if(text&&(role==='user'||role==='assistant')){
      try{state.onTranscript&&state.onTranscript({role,text,final:true})}catch(e){}
      try{window.dispatchEvent(new CustomEvent('gelo-gpt-live-turn',{detail:{role,text}}))}catch(e){}
    }
    emit(role==='assistant'?'assistant-done':'user-stopped');
    return;
  }
  if(type==='session.input_transcript.delta'){
    const text=String(ev&&ev.delta||'');
    if(text)try{state.onTranscript&&state.onTranscript({role:'user',text,final:false,delta:true})}catch(e){}
    return;
  }
  if(type==='session.output_transcript.delta'||type==='response.output_audio_transcript.delta'){
    const text=String(ev&&ev.delta||'');
    if(text)try{state.onTranscript&&state.onTranscript({role:'assistant',text,final:false,delta:true})}catch(e){}
    return;
  }
  if(type==='error'){
    emit('error',String(ev&&ev.error&&ev.error.message||ev&&ev.message||'Erro no GPT Live.'));
  }
}
async function stop(){
  const pc=state.pc,stream=state.stream,channel=state.channel,audio=state.audio;
  state.pc=null;state.stream=null;state.channel=null;state.audio=null;
  state.running=false;state.starting=false;state.muted=false;
  try{channel&&channel.close()}catch(e){}
  try{pc&&pc.close()}catch(e){}
  try{stream&&stream.getTracks().forEach(t=>t.stop())}catch(e){}
  try{if(audio){audio.pause();audio.srcObject=null;audio.remove()}}catch(e){}
  emit('stopped');
}
async function start(options){
  options=options||{};
  if(state.starting)return false;
  await stop();
  state.starting=true;
  emit('connecting');
  try{
    const auth=window.GeloTutoiaGPT&&typeof window.GeloTutoiaGPT.auth==='function'
      ?await window.GeloTutoiaGPT.auth():'';
    if(!auth)throw new Error('Faça login no GPT do Gelo Tutóia.');

    state.onTranscript=typeof options.onTranscript==='function'?options.onTranscript:null;
    state.onState=typeof options.onState==='function'?options.onState:null;

    const stream=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
      video:false
    });
    const pc=new RTCPeerConnection();
    const channel=pc.createDataChannel('oai-events');
    const audio=document.createElement('audio');
    audio.autoplay=true;audio.playsInline=true;audio.style.display='none';
    document.body.appendChild(audio);

    state.stream=stream;state.pc=pc;state.channel=channel;state.audio=audio;
    stream.getAudioTracks().forEach(t=>pc.addTrack(t,stream));

    pc.ontrack=e=>{
      const media=(e.streams&&e.streams[0])||new MediaStream([e.track]);
      audio.srcObject=media;
      const p=audio.play();
      if(p&&typeof p.catch==='function')p.catch(()=>{});
    };
    pc.onconnectionstatechange=()=>{
      emit('connection',pc.connectionState);
      if(['failed','closed'].includes(pc.connectionState))state.running=false;
    };
    channel.onopen=()=>emit('channel-open');
    channel.onmessage=e=>parseEvent(e.data);

    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc);

    const backend=String(window.GeloTutoiaGPT&&window.GeloTutoiaGPT.base||'https://turbo-engine-production.up.railway.app');
    const response=await fetch(backend+'/__turbo/voice/start',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer '+auth},
      body:JSON.stringify({
        sdp:pc.localDescription&&pc.localDescription.sdp||'',
        voice:String(options.voice||'cove'),
        instructions:String(options.instructions||[
          'Você é o assistente de voz do Gelo Tutóia.',
          'Converse de forma natural, curta e objetiva em português do Brasil.',
          'Ajude o Cláudio com vendas, clientes, pagamentos e histórico do WhatsApp.',
          'Nunca invente vendas, valores, clientes ou entregas.',
          'Quando o usuário pedir histórico, relatório, fechamento, vendas do WhatsApp ou dados do WuzAPI, não diga que está pesquisando e não improvise uma resposta. O aplicativo consulta os dados reais e depois envia o resultado para você ler.'
        ].join(' ')).slice(0,12000)
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data||!data.ok||!data.sdp)throw new Error(data&&data.error||'Não foi possível abrir o GPT Live.');
    await pc.setRemoteDescription({type:'answer',sdp:data.sdp});
    state.running=true;state.starting=false;
    emit('live',{voice:data.voice||options.voice||'cove',model:data.model||'GPT Live'});
    return true;
  }catch(err){
    const msg=String(err&&err.message||err);
    await stop();
    emit('error',msg);
    throw err;
  }
}
function cancelResponse(){
  sendEvent({type:'response.cancel'});
  sendEvent({type:'output_audio_buffer.clear'});
}
function speakText(text){
  text=String(text||'').trim();
  if(!text)return false;
  if(!sendEvent({
    type:'conversation.item.create',
    item:{type:'message',role:'user',content:[{type:'input_text',text:'Leia em voz alta exatamente este texto, sem acrescentar nada:\n\n'+text}]}
  }))return false;
  sendEvent({type:'response.create',response:{output_modalities:['audio'],instructions:'Leia exatamente o texto enviado, sem comentários extras.'}});
  return true;
}
function setMuted(v){
  state.muted=!!v;
  (state.stream&&state.stream.getAudioTracks?state.stream.getAudioTracks():[]).forEach(t=>t.enabled=!state.muted);
  emit(state.muted?'muted':'unmuted');
  return state.muted;
}
window.GeloGPTLive={state,start,stop,sendEvent,cancelResponse,speakText,setMuted,toggleMute:()=>setMuted(!state.muted)};
})();