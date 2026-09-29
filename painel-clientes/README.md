# Painel de Clientes WhatsApp

Painel piloto para cadastrar clientes e conectar cada número ao WuzAPI.

## Variáveis
- PORT
- DATA_DIR
- WUZAPI_URL
- WUZAPI_ADMIN_TOKEN

## Fluxo
1. Cadastrar cliente.
2. O backend cria um usuário separado no WuzAPI.
3. O painel inicia a sessão e mostra o QR Code.
4. O cliente escaneia no próprio WhatsApp/WhatsApp Business.
5. O painel acompanha status e possui controles de IA e atendimento manual.

A IA ainda não responde mensagens nesta primeira etapa. Os controles já ficam gravados para a próxima etapa, em que o webhook será ligado ao agente.

Deploy inicial do painel configurado no Railway como serviço separado, sem alterar os serviços openwa-test e wuzapi-test.
