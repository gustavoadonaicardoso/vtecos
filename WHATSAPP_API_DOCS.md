# 📱 WhatsApp API — Documentação Técnica Completa

> **VTEC OS** — Integração WhatsApp Business  
> Atualizado em: Maio 2025

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Configuração — Meta Cloud API (Oficial)](#3-configuração--meta-cloud-api-oficial)
4. [Configuração — Z-API Gateway](#4-configuração--z-api-gateway)
5. [Variáveis de Ambiente](#5-variáveis-de-ambiente)
6. [Configuração do Webhook](#6-configuração-do-webhook)
7. [Endpoints Disponíveis](#7-endpoints-disponíveis)
8. [Exemplos de Uso](#8-exemplos-de-uso)
9. [Fluxo de Mensagens](#9-fluxo-de-mensagens)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Visão Geral

### Conexão gratuita via WhatsApp Web

O conector padrão sem gateway usa Baileys e a sessão multidispositivo do WhatsApp Web.
Ele não exige Z-API nem cobrança por mensagem. A aplicação precisa executar em um processo
Node.js persistente e o diretório de sessão também precisa ser persistente.

| Função | Endpoint |
|---|---|
| Iniciar conexão, consultar status e obter QR Code | `GET /api/whatsapp/web/connection` |
| Desconectar o aparelho | `DELETE /api/whatsapp/web/connection` |
| Enviar mensagem | `POST /api/whatsapp/web/send` |

Por padrão, as chaves ficam em `.whatsapp-session/`. Em produção, configure um volume
persistente e, se necessário, defina `WHATSAPP_WEB_SESSION_PATH=/caminho/do/volume`.

> Esta conexão é gratuita e autogerenciada, mas não é uma API oficial da Meta. Evite disparos
> abusivos e automações que violem os termos do WhatsApp.

### Integrações legadas e oficiais

O VTEC OS suporta **duas integrações WhatsApp** em paralelo:

| Integração | Rota Webhook | Rota de Envio | Descrição |
|---|---|---|---|
| **Meta Cloud API** (oficial) | `POST /api/webhooks/meta` | `POST /api/whatsapp/send` | API oficial da Meta. Requer aprovação de número e conta WABA. |
| **Z-API Gateway** (não-oficial) | `POST /api/webhooks/z-api` | `POST /api/whatsapp/zapi/send` | Gateway via instância WhatsApp conectada por QR Code. |

> **Recomendação:** Use a **Meta Cloud API** para produção (estável, sem risco de ban). Use o **Z-API** para testes ou volumes menores.

---

## 2. Pré-requisitos

### Para Meta Cloud API

- [ ] Conta no [Meta for Developers](https://developers.facebook.com)
- [ ] Conta no [Meta Business Manager](https://business.facebook.com)
- [ ] Número de telefone **dedicado** (não pode estar em nenhum app WhatsApp)
- [ ] Conta WhatsApp Business Account (WABA) aprovada
- [ ] App Meta do tipo **Business** criado
- [ ] URL pública com HTTPS (necessária para webhook)

### Para Z-API

- [ ] Conta em [z-api.io](https://z-api.io)
- [ ] Instância criada e conectada via QR Code
- [ ] Número WhatsApp ativo no celular (não pode ser desconectado)

---

## 3. Configuração — Meta Cloud API (Oficial)

### Passo 1: Criar App Meta

1. Acesse [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Clique em **"Criar App"**
3. Selecione o tipo **"Business"**
4. Preencha nome e e-mail de contato
5. Na tela de produtos, clique **"Configurar"** em **WhatsApp**

### Passo 2: Configurar WhatsApp Business

1. No painel do app, acesse **WhatsApp > Configuração**
2. Copie o **Phone Number ID** (ex: `1234567890123456`)
3. Copie o **WhatsApp Business Account ID** (ex: `9876543210987654`)
4. Em **"Número de telefone de teste"**, você pode enviar mensagens de teste

### Passo 3: Gerar Token Permanente (System User)

> ⚠️ **Nunca use o token temporário em produção** — ele expira em 24h.

1. Acesse [business.facebook.com](https://business.facebook.com)
2. Vá em **Configurações > Usuários > Usuários do sistema**
3. Clique em **"Adicionar"** → crie um **System User** com papel "Admin"
4. Clique em **"Gerar token"**
5. Selecione o App criado e marque as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. Copie o token gerado (começa com `EAA...`)

### Passo 4: Obter App Secret

1. No painel do app, vá em **Configurações > Básico**
2. Localize o campo **"Chave secreta do app"**
3. Clique em **"Mostrar"** e copie o valor

### Passo 5: Preencher `.env.local`

```env
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxx...
WHATSAPP_PHONE_NUMBER_ID=1234567890123456
WHATSAPP_BUSINESS_ACCOUNT_ID=9876543210987654
WHATSAPP_WEBHOOK_VERIFY_TOKEN=vtec_whatsapp_webhook_2025_secret
WHATSAPP_APP_SECRET=xxxxxxxxxxxxxxxx
```

---

## 4. Configuração — Z-API Gateway

### Passo 1: Criar Instância

1. Acesse [app.z-api.io](https://app.z-api.io) e faça login
2. Clique em **"Nova Instância"**
3. Aguarde a criação e copie:
   - **Instance ID** (ex: `3DG123456ABC`)
   - **Token** (ex: `F8D0A2B1C3E4...`)
4. Clique em **"Conectar"** e escaneie o QR Code com seu WhatsApp

### Passo 2: Obter Client Token (Security Token)

1. Clique no seu avatar no canto superior direito
2. Vá em **"Conta"** → **"Security Token"**
3. Copie o token exibido

### Passo 3: Configurar no Supabase (preferível)

As credenciais Z-API são armazenadas no banco de dados para facilitar a troca sem redeploy:

```sql
INSERT INTO integrations_config (provider, config) VALUES (
  'zapi',
  '{
    "instanceId": "SEU_INSTANCE_ID",
    "token": "SEU_TOKEN",
    "clientToken": "SEU_CLIENT_TOKEN",
    "receiveGroups": false
  }'
) ON CONFLICT (provider) DO UPDATE SET config = EXCLUDED.config;
```

Ou configure via interface em **Configurações > Integrações > WhatsApp**.

### Passo 4: Configurar Webhook no Z-API

1. No painel Z-API, acesse sua instância
2. Vá em **"Webhooks"**
3. Configure:
   - **On Message Received:** `https://SEU_DOMINIO/api/webhooks/z-api`
   - **On Message Status Change:** (opcional)
   - Habilite **"Receive in Group"** se quiser grupos

---

## 5. Variáveis de Ambiente

### Tabela Completa

| Variável | Obrigatória | Descrição | Onde Obter |
|---|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | ✅ Meta | Token do System User (permanente) | Meta Business > System Users |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ Meta | ID do número de telefone no WABA | Meta Developers > WhatsApp > Setup |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ✅ Meta | WABA ID | Meta Developers > WhatsApp > Accounts |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | ✅ Meta | Token secreto de verificação (você define) | Definido por você |
| `WHATSAPP_APP_SECRET` | ✅ Meta | App Secret para HMAC-SHA256 | Meta Developers > Basic Settings |
| `ZAPI_INSTANCE_ID` | ⚠️ Z-API | ID da instância Z-API | z-api.io > Instância |
| `ZAPI_TOKEN` | ⚠️ Z-API | Token da instância Z-API | z-api.io > Instância |
| `ZAPI_CLIENT_TOKEN` | ⚠️ Z-API | Security Token da conta Z-API | z-api.io > Conta > Security |
| `NEXT_PUBLIC_APP_URL` | ✅ Geral | URL pública da aplicação | Seu domínio de produção |

> ⚠️ **Nunca commite o `.env.local` no Git!** O `.gitignore` já o exclui.

---

## 6. Configuração do Webhook

### Meta Cloud API

#### Registrar Webhook

1. Acesse: **Meta Developers > Seu App > WhatsApp > Configuração**
2. Na seção **"Webhooks"**, clique em **"Configurar"**
3. Preencha:
   - **URL de callback:** `https://SEU_DOMINIO/api/webhooks/meta`
   - **Verify Token:** mesmo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. Clique em **"Verificar e salvar"**
   - A Meta faz uma requisição GET → a rota valida o token → retorna o challenge
5. Assine os seguintes campos:
   - ✅ `messages`
   - ✅ `message_template_status_update` (para templates)

#### Verificação do Webhook (handshake)

```
GET /api/webhooks/meta?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=12345

→ Resposta: 12345 (text/plain, HTTP 200)
```

#### Payload de Exemplo — Mensagem Recebida

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550000000",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{
          "profile": { "name": "João Silva" },
          "wa_id": "5511999887766"
        }],
        "messages": [{
          "id": "wamid.HBg...",
          "from": "5511999887766",
          "timestamp": "1716000000",
          "type": "text",
          "text": { "body": "Olá! Quero saber mais sobre o produto." }
        }]
      }
    }]
  }]
}
```

#### Payload de Exemplo — Status de Mensagem

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "15550000000", "phone_number_id": "PHONE_ID" },
        "statuses": [{
          "id": "wamid.HBg...",
          "status": "delivered",
          "timestamp": "1716000010",
          "recipient_id": "5511999887766"
        }]
      }
    }]
  }]
}
```

### Z-API Webhook

Payload recebido no `POST /api/webhooks/z-api`:

```json
{
  "phone": "5511999887766",
  "isGroup": false,
  "senderName": "João Silva",
  "text": { "message": "Olá!" },
  "audio": null
}
```

---

## 7. Endpoints Disponíveis

### Envio — Meta Cloud API

```
POST /api/whatsapp/send
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `phone` | string | ✅ | Telefone (com ou sem código país) |
| `type` | string | ✅ | `text`, `template`, `image`, `video`, `document`, `audio`, `buttons`, `list` |
| `leadId` | string | ❌ | UUID do lead para salvar histórico |
| `text` | string | Tipo `text` | Texto da mensagem |
| `template` | string | Tipo `template` | Nome do template aprovado |
| `language` | string | Tipo `template` | Código do idioma (padrão: `pt_BR`) |
| `url` | string | Mídias | URL pública do arquivo |
| `caption` | string | ❌ | Legenda para imagem/vídeo/documento |
| `filename` | string | Tipo `document` | Nome do arquivo |
| `bodyText` | string | `buttons`/`list` | Texto do corpo da mensagem |
| `buttons` | array | Tipo `buttons` | `[{ id, title }]` — máx 3 |
| `buttonLabel` | string | Tipo `list` | Rótulo do botão da lista |
| `sections` | array | Tipo `list` | Seções com linhas |

### Envio — Z-API

```
POST /api/whatsapp/zapi/send
GET  /api/whatsapp/zapi/send  → Verifica configuração
```

### Webhooks

```
GET  /api/webhooks/meta       → Verificação do webhook (Meta handshake)
POST /api/webhooks/meta       → Recebe eventos (mensagens + status)
POST /api/webhooks/z-api      → Recebe mensagens via Z-API
```

---

## 8. Exemplos de Uso

### Enviar Texto (Meta API)

```bash
curl -X POST https://SEU_DOMINIO/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999887766",
    "type": "text",
    "text": "Olá João! Seu pedido foi confirmado.",
    "leadId": "uuid-do-lead"
  }'
```

### Enviar Template

```bash
curl -X POST https://SEU_DOMINIO/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999887766",
    "type": "template",
    "template": "confirmacao_pedido",
    "language": "pt_BR",
    "components": [{
      "type": "body",
      "parameters": [
        { "type": "text", "text": "João" },
        { "type": "text", "text": "#12345" }
      ]
    }]
  }'
```

### Enviar Documento

```bash
curl -X POST https://SEU_DOMINIO/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999887766",
    "type": "document",
    "url": "https://exemplo.com/contrato.pdf",
    "filename": "Contrato_VTECsOS.pdf",
    "caption": "Segue o contrato para assinatura."
  }'
```

### Enviar Botões

```bash
curl -X POST https://SEU_DOMINIO/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999887766",
    "type": "buttons",
    "bodyText": "Você gostaria de falar com um de nossos consultores?",
    "buttons": [
      { "id": "sim_consultor", "title": "Sim, quero!" },
      { "id": "nao_obrigado", "title": "Não, obrigado" }
    ],
    "footer": "VTEC OS — Atendimento"
  }'
```

### Enviar via Z-API

```bash
curl -X POST https://SEU_DOMINIO/api/whatsapp/zapi/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999887766",
    "message": "Olá! Como posso ajudar?",
    "leadId": "uuid-do-lead",
    "delayTyping": 2000
  }'
```

### Testar Webhook Localmente (ngrok)

```bash
# 1. Instale o ngrok: https://ngrok.com/download
# 2. Exponha a porta local:
ngrok http 3000

# 3. Use a URL gerada (ex: https://abc123.ngrok.io) como:
#    URL Webhook Meta: https://abc123.ngrok.io/api/webhooks/meta
#    URL Webhook Z-API: https://abc123.ngrok.io/api/webhooks/z-api
```

---

## 9. Fluxo de Mensagens

### Recebimento (Inbound)

```
WhatsApp do Cliente
      │
      ▼
  Meta Cloud API
      │
      ▼  (POST com assinatura HMAC-SHA256)
/api/webhooks/meta
      │
      ├─ Valida assinatura HMAC-SHA256
      ├─ Retorna HTTP 200 imediatamente
      │
      └─ (assíncrono)
           │
           ├─ Extrai telefone e texto
           ├─ Busca lead no Supabase
           │    └─ Se não encontrar → cria novo lead
           ├─ Salva mensagem em chat_messages
           ├─ Atualiza last_msg do lead
           ├─ Marca mensagem como lida (duplo-check azul)
           └─ Aplica roteamento de campanha blast (se houver)
```

### Envio (Outbound)

```
Frontend VTEC OS
      │
      ▼  (POST /api/whatsapp/send)
  API Route (Next.js)
      │
      ├─ Valida campos obrigatórios
      ├─ Salva mensagem no banco (status: 'sending')
      │
      ▼  (POST https://graph.facebook.com/v21.0/{phoneId}/messages)
  Meta Cloud API
      │
      ├─ Retorna wamid (ID da mensagem)
      │
      ▼
  Atualiza status no banco → 'sent'
      │
      ▼
  Meta envia webhook de status:
    delivered → atualiza banco → 'delivered'
    read      → atualiza banco → 'read'
```

---

## 10. Troubleshooting

### ❌ Erro: "Configuração WhatsApp incompleta"

**Causa:** Variáveis de ambiente não configuradas.  
**Solução:** Verifique se todas as 5 variáveis `WHATSAPP_*` estão no `.env.local` e reinicie o servidor.

```bash
npm run dev
```

### ❌ Erro: "Assinatura HMAC inválida" (HTTP 401 no webhook)

**Causa:** `WHATSAPP_APP_SECRET` incorreto ou body foi modificado em trânsito.  
**Solução:**  
1. Verifique o `WHATSAPP_APP_SECRET` no painel Meta.
2. Certifique-se de que nenhum middleware está modificando o body antes da rota.

### ❌ Webhook não recebe eventos

**Causa 1:** URL não acessível publicamente.  
→ Use ngrok para testes locais.

**Causa 2:** Campo `messages` não assinado no Meta.  
→ Meta Developers > WhatsApp > Configuração > Webhook Fields > marque `messages`.

**Causa 3:** Token de verificação não bate.  
→ Confirme que `WHATSAPP_WEBHOOK_VERIFY_TOKEN` é idêntico ao que foi cadastrado na Meta.

### ❌ Mensagens não aparecem no lead

**Causa:** Tabela `chat_messages` não tem coluna `external_id`, `provider` ou `phone_number_id`.  
**Solução:** Execute no Supabase:

```sql
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'zapi',
  ADD COLUMN IF NOT EXISTS phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS error_details JSONB;

CREATE INDEX IF NOT EXISTS idx_chat_messages_external_id ON chat_messages(external_id);
```

### ❌ Z-API: "Z-API não configurada"

**Causa:** Credenciais não encontradas no Supabase nem no `.env.local`.  
**Solução:**  
1. Configure via interface: Configurações > Integrações > WhatsApp.  
2. Ou adicione ao `.env.local`: `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`.

### ❌ Template rejeitado (erro 132001)

**Causa:** Template não aprovado ou nome incorreto.  
**Solução:**  
1. Verifique os templates em Meta Business > WhatsApp Manager > Templates.
2. O status deve ser **"Aprovado"**.
3. O nome no código deve ser idêntico (case-sensitive).

---

## Links Úteis

- 📚 [Meta Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- 📚 [Webhooks Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- 📚 [Template Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates)
- 📚 [Z-API Docs](https://developer.z-api.io/)
- 🔧 [Meta Business Manager](https://business.facebook.com)
- 🔧 [Meta for Developers](https://developers.facebook.com)
- 🧪 [ngrok — Túnel HTTPS local](https://ngrok.com)
- 🔍 [Webhook Tester](https://webhook.site)
