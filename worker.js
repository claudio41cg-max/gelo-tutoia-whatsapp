const VERIFY_TOKEN = "gelo-tutoia-2026";
//testando
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

                                                                                      return new Response("Token de verificação inválido", {
                                                                                              status: 403
                                                                                                    });
                                                                                                        }

                                                                                                            // Recebimento das mensagens do WhatsApp
                                                                                                                if (request.method === "POST") {
                                                                                                                      try {
                                                                                                                              const body = await request.json();

                                                                                                                                      console.log("Webhook WhatsApp recebido:");
                                                                                                                                              console.log(JSON.stringify(body));

                                                                                                                                                      return new Response("EVENT_RECEIVED", {
                                                                                                                                                                status: 200
                                                                                                                                                                        });
                                                                                                                                                                              } catch (error) {
                                                                                                                                                                                      console.log("Erro:", error);

                                                                                                                                                                                              return new Response("EVENT_RECEIVED", {
                                                                                                                                                                                                        status: 200
                                                                                                                                                                                                                });
                                                                                                                                                                                                                      }
                                                                                                                                                                                                                          }

                                                                                                                                                                                                                              return new Response("Webhook Gelo Tutóia ativo", {
                                                                                                                                                                                                                                    status: 200
                                                                                                                                                                                                                                        });
                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                          };
