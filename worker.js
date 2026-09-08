const VERIFY_TOKEN = "gelo-tutoia-2026";
const GRAPH_VERSION = "v26.0";

async function getWhatsAppMediaInfo(mediaId, accessToken) {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar mídia na Meta: HTTP ${response.status}`);
  }

  return response.json();
}

async function downloadWhatsAppMedia(mediaUrl, accessToken) {
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia da Meta: HTTP ${response.status}`);
  }

  return response.arrayBuffer();
}

async function salvarMensagemNoKV(env, resumo) {
  if (!env.VENDAS) {
    console.log("Gelo Tutóia - binding VENDAS não disponível");
    return;
  }

  const mensagemId = resumo.mensagem_id || `sem-id-${Date.now()}`;
  const key = `mensagem:${mensagemId}`;
  const registro = {
    ...resumo,
    status: "pendente",
    recebido_em: new Date().toISOString()
  };

  await env.VENDAS.put(key, JSON.stringify(registro));
  console.log("Gelo Tutóia - mensagem salva no KV:", key);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Verificação do webhook pela Meta
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain" }
        });
      }

      return new Response("Token de verificação inválido", { status: 403 });
    }

    // Recebimento das mensagens do WhatsApp
    if (request.method === "POST") {
      try {
        const body = await request.json();
        const value = body?.entry?.[0]?.changes?.[0]?.value;
        const message = value?.messages?.[0];
        const contact = value?.contacts?.[0];

        console.log("Webhook WhatsApp recebido");

        if (message) {
          const resumo = {
            tipo: message.type || "desconhecido",
            remetente: message.from || contact?.wa_id || "desconhecido",
            nome: contact?.profile?.name || "",
            mensagem_id: message.id || "",
            texto: message.text?.body || "",
            audio_id: message.audio?.id || "",
            audio_mime_type: message.audio?.mime_type || "",
            audio_voz: message.audio?.voice === true
          };

          console.log("Gelo Tutóia - mensagem:", JSON.stringify(resumo));

          try {
            await salvarMensagemNoKV(env, resumo);
          } catch (kvError) {
            console.log("Gelo Tutóia - erro ao salvar no KV:", String(kvError));
          }

          if (message.type === "audio" && message.audio?.id) {
            if (!env.META_ACCESS_TOKEN) {
              console.log("Gelo Tutóia - áudio detectado, mas META_ACCESS_TOKEN ainda não está configurado");
            } else {
              try {
                const mediaInfo = await getWhatsAppMediaInfo(message.audio.id, env.META_ACCESS_TOKEN);
                console.log("Gelo Tutóia - mídia localizada:", JSON.stringify({
                  id: mediaInfo.id || message.audio.id,
                  mime_type: mediaInfo.mime_type || message.audio?.mime_type || "",
                  file_size: mediaInfo.file_size || null
                }));

                if (mediaInfo.url) {
                  const audioBuffer = await downloadWhatsAppMedia(mediaInfo.url, env.META_ACCESS_TOKEN);
                  console.log("Gelo Tutóia - áudio baixado com sucesso:", JSON.stringify({
                    bytes: audioBuffer.byteLength,
                    mime_type: mediaInfo.mime_type || message.audio?.mime_type || ""
                  }));
                }
              } catch (mediaError) {
                console.log("Gelo Tutóia - erro ao obter áudio:", String(mediaError));
              }
            }
          }
        } else {
          console.log("Gelo Tutóia - evento sem mensagem:", JSON.stringify(body));
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      } catch (error) {
        console.log("Gelo Tutóia - erro no webhook:", String(error));
        return new Response("EVENT_RECEIVED", { status: 200 });
      }
    }

    return new Response("Webhook Gelo Tutóia ativo", { status: 200 });
  }
};
