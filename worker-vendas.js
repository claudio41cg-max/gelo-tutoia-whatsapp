import { interpretarVenda } from "./parser.js";

const VERIFY_TOKEN = "gelo-tutoia-2026";
const GRAPH_VERSION = "v26.0";
const TRANSCRIBE_MODEL = "@cf/openai/whisper-large-v3-turbo";

async function getWhatsAppMediaInfo(mediaId, accessToken) {
  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Falha ao consultar mídia na Meta: HTTP ${r.status}`);
  return r.json();
}

async function downloadWhatsAppMedia(mediaUrl, accessToken) {
  const r = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Falha ao baixar mídia da Meta: HTTP ${r.status}`);
  return r.arrayBuffer();
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
}

async function transcreverAudio(env, audioBuffer) {
  if (!env.AI) throw new Error("binding AI não disponível");
  const r = await env.AI.run(TRANSCRIBE_MODEL, {
    audio: arrayBufferToBase64(audioBuffer), task: "transcribe", language: "pt", vad_filter: true,
    initial_prompt: "Vendas de gelo no Rio de Janeiro. Preserve nomes de clientes, quantidades, PIX, dinheiro, fiado, escamas e filtrado."
  });
  return String(r?.text || "").trim();
}

function chaveMensagem(id) { return `mensagem:${id || `sem-id-${Date.now()}`}`; }

async function salvar(env, key, dados) {
  if (!env.VENDAS || !key) return;
  const atual = await env.VENDAS.get(key, { type: "json" }) || {};
  await env.VENDAS.put(key, JSON.stringify({ ...atual, ...dados, atualizado_em: new Date().toISOString() }));
}

async function interpretar(env, key, texto) {
  const venda = interpretarVenda(texto);
  await salvar(env, key, { status: "venda_interpretada", venda, interpretado_em: new Date().toISOString() });
  console.log("Gelo Tutóia - venda interpretada:", JSON.stringify(venda));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      return new Response("Token de verificação inválido", { status: 403 });
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();
        const value = body?.entry?.[0]?.changes?.[0]?.value;
        const message = value?.messages?.[0];
        const contact = value?.contacts?.[0];

        if (!message) return new Response("EVENT_RECEIVED", { status: 200 });

        const key = chaveMensagem(message.id);
        const resumo = {
          tipo: message.type || "desconhecido",
          remetente: message.from || contact?.wa_id || "desconhecido",
          nome: contact?.profile?.name || "",
          mensagem_id: message.id || "",
          texto: message.text?.body || "",
          audio_id: message.audio?.id || "",
          audio_mime_type: message.audio?.mime_type || "",
          audio_voz: message.audio?.voice === true,
          status: "pendente",
          recebido_em: new Date().toISOString()
        };
        await salvar(env, key, resumo);

        if (message.type === "text" && resumo.texto) {
          try { await interpretar(env, key, resumo.texto); } catch (e) { await salvar(env, key, { status: "erro_parser", erro_parser: String(e) }); }
        }

        if (message.type === "audio" && message.audio?.id) {
          if (!env.META_ACCESS_TOKEN) {
            await salvar(env, key, { status: "aguardando_token_meta" });
          } else {
            try {
              const media = await getWhatsAppMediaInfo(message.audio.id, env.META_ACCESS_TOKEN);
              if (media.url) {
                const audio = await downloadWhatsAppMedia(media.url, env.META_ACCESS_TOKEN);
                await salvar(env, key, { status: "audio_baixado", audio_bytes: audio.byteLength, audio_mime_type: media.mime_type || resumo.audio_mime_type, audio_file_size_meta: media.file_size || null });
                try {
                  await salvar(env, key, { status: "transcrevendo_audio" });
                  const texto = await transcreverAudio(env, audio);
                  await salvar(env, key, { status: "transcrito", texto, transcricao: texto, modelo_transcricao: TRANSCRIBE_MODEL, transcrito_em: new Date().toISOString() });
                  await interpretar(env, key, texto);
                } catch (e) {
                  await salvar(env, key, { status: "erro_transcricao", erro_transcricao: String(e) });
                }
              }
            } catch (e) {
              await salvar(env, key, { status: "erro_audio_meta", erro_audio: String(e) });
            }
          }
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      } catch (e) {
        console.log("Gelo Tutóia - erro no webhook:", String(e));
        return new Response("EVENT_RECEIVED", { status: 200 });
      }
    }

    return new Response("Webhook Gelo Tutóia ativo", { status: 200 });
  }
};
