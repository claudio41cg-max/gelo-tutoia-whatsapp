const VERIFY_TOKEN = "gelo-tutoia-2026";
const GRAPH_VERSION = "v26.0";
const TRANSCRIBE_MODEL = "@cf/openai/whisper-large-v3-turbo";

async function getWhatsAppMediaInfo(mediaId, accessToken) {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Falha ao consultar mídia na Meta: HTTP ${response.status}`);
  return response.json();
}

async function downloadWhatsAppMedia(mediaUrl, accessToken) {
  const response = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Falha ao baixar mídia da Meta: HTTP ${response.status}`);
  return response.arrayBuffer();
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer); let binary = ""; const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  return btoa(binary);
}

async function transcreverAudio(env, audioBuffer) {
  if (!env.AI) throw new Error("binding AI não disponível");
  const resultado = await env.AI.run(TRANSCRIBE_MODEL, { audio: arrayBufferToBase64(audioBuffer), task: "transcribe", language: "pt", vad_filter: true, initial_prompt: "Vendas de gelo no Rio de Janeiro. Preserve nomes de clientes, quantidades, PIX, dinheiro, fiado, escamas e filtrado." });
  return String(resultado?.text || "").trim();
}

function chaveMensagem(resumo) { const mensagemId = resumo.mensagem_id || `sem-id-${Date.now()}`; return `mensagem:${mensagemId}`; }

async function salvarMensagemNoKV(env, resumo) {
  if (!env.VENDAS) return null;
  const key = chaveMensagem(resumo);
  await env.VENDAS.put(key, JSON.stringify({ ...resumo, status: "pendente", recebido_em: new Date().toISOString() }));
  return key;
}

async function atualizarMensagemNoKV(env, key, alteracoes) {
  if (!env.VENDAS || !key) return;
  const atual = await env.VENDAS.get(key, { type: "json" }) || {};
  await env.VENDAS.put(key, JSON.stringify({ ...atual, ...alteracoes, atualizado_em: new Date().toISOString() }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode"), token = url.searchParams.get("hub.verify_token"), challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      return new Response("Token de verificação inválido", { status: 403 });
    }
    if (request.method === "POST") {
      try {
        const body = await request.json(); const value = body?.entry?.[0]?.changes?.[0]?.value; const message = value?.messages?.[0]; const contact = value?.contacts?.[0];
        if (message) {
          const resumo = { tipo: message.type || "desconhecido", remetente: message.from || contact?.wa_id || "desconhecido", nome: contact?.profile?.name || "", mensagem_id: message.id || "", texto: message.text?.body || "", audio_id: message.audio?.id || "", audio_mime_type: message.audio?.mime_type || "", audio_voz: message.audio?.voice === true };
          let kvKey = null; try { kvKey = await salvarMensagemNoKV(env, resumo); } catch {}
          if (message.type === "audio" && message.audio?.id && env.META_ACCESS_TOKEN) {
            try {
              const mediaInfo = await getWhatsAppMediaInfo(message.audio.id, env.META_ACCESS_TOKEN);
              if (mediaInfo.url) {
                const audioBuffer = await downloadWhatsAppMedia(mediaInfo.url, env.META_ACCESS_TOKEN);
                await atualizarMensagemNoKV(env, kvKey, { status: "audio_baixado", audio_bytes: audioBuffer.byteLength, audio_mime_type: mediaInfo.mime_type || message.audio?.mime_type || "" });
                try {
                  await atualizarMensagemNoKV(env, kvKey, { status: "transcrevendo_audio" });
                  const textoTranscrito = await transcreverAudio(env, audioBuffer);
                  await atualizarMensagemNoKV(env, kvKey, { status: "transcrito", texto: textoTranscrito, transcricao: textoTranscrito, modelo_transcricao: TRANSCRIBE_MODEL, transcrito_em: new Date().toISOString() });
                } catch (e) { await atualizarMensagemNoKV(env, kvKey, { status: "erro_transcricao", erro_transcricao: String(e) }); }
              }
            } catch (e) { await atualizarMensagemNoKV(env, kvKey, { status: "erro_audio_meta", erro_audio: String(e) }); }
          }
        }
        return new Response("EVENT_RECEIVED", { status: 200 });
      } catch { return new Response("EVENT_RECEIVED", { status: 200 }); }
    }
    return new Response("Webhook Gelo Tutóia ativo", { status: 200 });
  }
};
