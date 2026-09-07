const VERIFY_TOKEN = "gelo-tutoia-2026";

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
