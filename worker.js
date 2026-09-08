const VERIFY_TOKEN = "gelo-tutoia-2026";
const GRAPH_VERSION = "v26.0";
const TRANSCRIBE_MODEL = "@cf/openai/whisper-large-v3-turbo";

const NUMEROS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20
};

const ALIASES_CLIENTES = [
  ["marcelo caldo de cana", "Marcelo 1"],
  ["caldo de cana", "Marcelo 1"],
  ["marcelo 2", "Marcelo 2"],
  ["marcelo cosmos", "Marcelo 2"],
  ["padaria paciencia", "Padaria Paciência"],
  ["barraca condominio", "Barraca Condomínio"],
  ["condominio", "Barraca Condomínio"],
  ["padaria", "Padaria BMG"],
  ["peixaria tiago", "Tiago"],
  ["peixaria para", "Pará"],
  ["sr gilson", "Seu Gilson"],
  ["senhor gilson", "Seu Gilson"],
  ["gilson", "Seu Gilson"],
  ["chop feira", "Chop Feira"]
];

function normalizar(texto = "") {
  return String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function primeiroNumero(texto) {
  const t = normalizar(texto);
  const digito = t.match(/\b(\d+)\b/);
  if (digito) return Number(digito[1]);
  for (const [palavra, valor] of Object.entries(NUMEROS)) {
    if (new RegExp(`\\b${palavra}\\b`).test(t)) return valor;
  }
  return null;
}

function numeroAntesDe(texto, termo) {
  const t = normalizar(texto);
  const palavrasNumero = Object.keys(NUMEROS).join("|");
  const re = new RegExp(`(?:\\b(\\d+)\\b|\\b(${palavrasNumero})\\b)(?:\\s+sacos?)?\\s+(?:de\\s+)?${termo}`);
  const m = t.match(re);
  if (!m) return null;
  return m[1] ? Number(m[1]) : NUMEROS[m[2]];
}

function identificarCliente(texto) {
  const t = normalizar(texto);
  for (const [alias, cliente] of ALIASES_CLIENTES) {
    if (t.includes(alias)) return cliente;
  }
  return null;
}

function parseVenda(texto) {
  const original = String(texto || "").trim();
  const t = normalizar(original);
  const cliente = identificarCliente(original);

  let pagamento = "Não informado";
  if (/\bfiado\b/.test(t)) pagamento = "Fiado";
  else if (/\bpix\b/.test(t)) pagamento = "PIX";
  else if (/\bpago\b|\bdinheiro\b/.test(t)) pagamento = "Dinheiro";

  let filtrado = numeroAntesDe(original, "filtrado(?:s)?");
  let escamas = numeroAntesDe(original, "escamas?");

  const temFiltrado = /\bfiltrado(?:s)?\b/.test(t);
  const temEscamas = /\bescamas?\b/.test(t);

  if (filtrado == null && escamas == null) {
    const qtd = primeiroNumero(original);
    if (qtd != null) {
      if (temFiltrado && !temEscamas) filtrado = qtd;
      else escamas = qtd;
    }
  }

  filtrado = filtrado || 0;
  escamas = escamas || 0;

  const quantidadeTotal = filtrado + escamas;
  const confiavel = Boolean(cliente && quantidadeTotal > 0);

  return {
    cliente,
    escamas,
    filtrado,
    quantidade_total: quantidadeTotal,
    pagamento,
    texto_original: original,
    status: "pendente_revisao",
    confianca: confiavel ? "alta" : "revisar"
  };
}

async function getWhatsAppMediaInfo(mediaId, accessToken) {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Falha ao consultar mídia na Meta: HTTP ${response.status}`);
  return response.json();
}

async function downloadWhatsAppMedia(mediaUrl, accessToken) {
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Falha ao baixar mídia da Meta: HTTP ${response.status}`);
  return response.arrayBuffer();
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function transcreverAudio(env, audioBuffer) {
  if (!env.AI) throw new Error("binding AI não disponível");
  const audioBase64 = arrayBufferToBase64(audioBuffer);
  const resultado = await env.AI.run(TRANSCRIBE_MODEL, {
    audio: audioBase64,
    task: "transcribe",
    language: "pt",
    vad_filter: true,
    initial_prompt: "Vendas de gelo no Rio de Janeiro. Preserve nomes de clientes, quantidades, PIX, dinheiro, fiado, escamas e filtrado."
  });
  return String(resultado?.text || "").trim();
}

function chaveMensagem(resumo) {
  const mensagemId = resumo.mensagem_id || `sem-id-${Date.now()}`;
  return `mensagem:${mensagemId}`;
}

async function salvarMensagemNoKV(env, resumo) {
  if (!env.VENDAS) return null;
  const key = chaveMensagem(resumo);
  const registro = { ...resumo, status: "pendente", recebido_em: new Date().toISOString() };
  await env.VENDAS.put(key, JSON.stringify(registro));
  return key;
}

async function atualizarMensagemNoKV(env, key, alteracoes) {
  if (!env.VENDAS || !key) return;
  const atual = await env.VENDAS.get(key, { type: "json" }) || {};
  const novo = { ...atual, ...alteracoes, atualizado_em: new Date().toISOString() };
  await env.VENDAS.put(key, JSON.stringify(novo));
}

async function aplicarParserNoKV(env, key, texto) {
  const venda = parseVenda(texto);
  await atualizarMensagemNoKV(env, key, {
    venda,
    status: "pendente_revisao",
    parseado_em: new Date().toISOString()
  });
  return venda;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/teste-venda") {
      const token = url.searchParams.get("token");
      if (token !== VERIFY_TOKEN) return new Response("Não autorizado", { status: 403 });

      const texto = url.searchParams.get("texto") || "";
      if (!texto) return Response.json({ erro: "Informe ?texto=" }, { status: 400 });

      const venda = parseVenda(texto);
      const key = `teste:${Date.now()}`;
      if (env.VENDAS) {
        await env.VENDAS.put(key, JSON.stringify({
          tipo: "teste_parser",
          texto,
          venda,
          criado_em: new Date().toISOString()
        }), { expirationTtl: 86400 });
      }

      return Response.json({ ok: true, key, venda });
    }

    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      }
      return new Response("Token de verificação inválido", { status: 403 });
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();
        const value = body?.entry?.[0]?.changes?.[0]?.value;
        const message = value?.messages?.[0];
        const contact = value?.contacts?.[0];

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

          let kvKey = null;
          try { kvKey = await salvarMensagemNoKV(env, resumo); } catch (e) { console.log(String(e)); }

          if (message.type === "text" && resumo.texto) {
            try { await aplicarParserNoKV(env, kvKey, resumo.texto); } catch (e) { console.log(String(e)); }
          }

          if (message.type === "audio" && message.audio?.id) {
            if (!env.META_ACCESS_TOKEN) {
              try { await atualizarMensagemNoKV(env, kvKey, { status: "aguardando_token_meta" }); } catch (e) { console.log(String(e)); }
            } else {
              try {
                const mediaInfo = await getWhatsAppMediaInfo(message.audio.id, env.META_ACCESS_TOKEN);
                if (mediaInfo.url) {
                  const audioBuffer = await downloadWhatsAppMedia(mediaInfo.url, env.META_ACCESS_TOKEN);
                  await atualizarMensagemNoKV(env, kvKey, {
                    status: "audio_baixado",
                    audio_bytes: audioBuffer.byteLength,
                    audio_mime_type: mediaInfo.mime_type || message.audio?.mime_type || "",
                    audio_file_size_meta: mediaInfo.file_size || null,
                    audio_baixado_em: new Date().toISOString()
                  });

                  try {
                    await atualizarMensagemNoKV(env, kvKey, { status: "transcrevendo_audio" });
                    const textoTranscrito = await transcreverAudio(env, audioBuffer);
                    await atualizarMensagemNoKV(env, kvKey, {
                      status: "transcrito",
                      texto: textoTranscrito,
                      transcricao: textoTranscrito,
                      modelo_transcricao: TRANSCRIBE_MODEL,
                      transcrito_em: new Date().toISOString()
                    });
                    await aplicarParserNoKV(env, kvKey, textoTranscrito);
                  } catch (e) {
                    await atualizarMensagemNoKV(env, kvKey, { status: "erro_transcricao", erro_transcricao: String(e) });
                  }
                }
              } catch (e) {
                try { await atualizarMensagemNoKV(env, kvKey, { status: "erro_audio_meta", erro_audio: String(e) }); } catch (_) {}
              }
            }
          }
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
