<div align="center">

# vtec os · Vórtice CRM

**Sistema da Vórtice Tecnologia para pequenas empresas que vendem e atendem pelo WhatsApp e pelas redes sociais.**
Leads, funil de vendas, WhatsApp da equipe, atendente com IA, agenda, disparos e precificação, num lugar só.

<br/>

![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Status](https://img.shields.io/badge/Status-Produção-10b981?style=flat-square)

<br/>

[Módulos e planos](#-módulos-e-planos) · [Arquitetura](#-arquitetura) · [Rodar localmente](#-rodar-localmente) · [Banco de dados](#-banco-de-dados) · [Deploy](#-deploy) · [Verificações](#-verificações)

</div>

---

## 📌 Sobre

O **vtec os** roda em produção em `app.vorticetecnologia.com.br`. Cada cliente é uma **empresa** separada: toda consulta filtra pela empresa (`tenant_id`) e o **plano** da empresa define quais módulos ela vê e quais limites tem. A Vórtice é a empresa da plataforma: tem todos os módulos, sem limites, e o **Painel Master** para cadastrar clientes, planos, banners, avisos de status e a Central de Ajuda.

📄 **Fluxograma do sistema** (jornada do cliente, módulos e planos, arquitetura): [`docs/fluxograma-vtec-os.pdf`](docs/fluxograma-vtec-os.pdf)

---

## ✨ Módulos e planos

Os módulos ficam em [`src/lib/plans.ts`](src/lib/plans.ts). Um módulo fora do plano some do menu e a página responde "Acesso negado".

| Módulo (chave) | O que faz | Páginas |
|---|---|---|
| CRM e Atendimento (`crm`) | Leads, funil, conversas do WhatsApp (Web e API oficial), Instagram Direct e Messenger, respostas rápidas com atalho `/`, metas, relatórios | `/leads` `/pipeline` `/messages` `/metas` `/relatorios` |
| Agendamento (`agendamento`) | Agenda, lembretes e mensagens programadas | `/scheduling` |
| Custos e Precificação (`financeiro`) | Insumos, fichas técnicas, preço por canal, despesas em BRL/USD/EUR, lucro e ponto de equilíbrio | `/financeiro` |
| Automações e IA (`automacoes`) | Fluxos automáticos e Atendente com IA no WhatsApp, Direct e Messenger | `/automations` |
| Disparos (`disparos`) | Campanhas de mensagens em massa | `/disparos` |
| Redes Sociais (`social`) | Calendário, posts agendados, aprovação e insights no Instagram e Facebook | `/social` |
| Discador (`discador`) | Ligações pelo navegador e discagem automática (Twilio da empresa) | `/discador` |
| Senhas, Totem e TV (`senhas`) | Fila de atendimento presencial | `/queue` (+ telas públicas `/totem` e `/display`) |
| Planejamentos e Projetos (`planejamentos`) | Funis, mapas de estratégia e projetos | `/planejamentos` `/projetos` |

**Toda empresa tem:** Início, Chat interno, Equipe, Integrações, Configurações, Notificações, Central de Ajuda e Chamados (`BASE_ROUTES`).

### Planos de venda

Criados pela migration `202610310001_plans_modules_limits.sql` e editáveis no Painel Master > Empresas e Planos. Cada plano soma módulos ao anterior. No anual, o cliente paga 10 meses.

| Plano | Mensal | Módulos | Usuários | IA da Vórtice/mês | Disparos/dia |
|---|---|---|---|---|---|
| Precificação | R$ 29 | Custos e Precificação | 1 | — | — |
| Essencial | R$ 59 | + CRM e Atendimento, Agendamento | 2 | — | — |
| **Profissional** (destaque) | R$ 119 | + Automações e IA, Disparos, Redes Sociais | 5 | 500 | 100 |
| Completo | R$ 229 | + Discador, Senhas, Planejamentos e Projetos | 10 | 2.000 | 300 |

**Limites** ([`src/lib/plan-limits.ts`](src/lib/plan-limits.ts)): vazio = sem limite, `0` = não incluído.

- **Usuários:** checado ao criar ou reativar alguém (conta só usuários ativos).
- **IA por mês:** contador atômico no banco (`consume_tenant_usage`), zera no dia 1º (horário de Brasília); admins são avisados em 80% e 100%. Empresa com chave própria do Gemini não gasta a franquia.
- **Disparos por dia:** soma de todas as campanhas da empresa; ao bater o limite, o envio continua no dia seguinte.
- Sem o módulo, as automações não rodam e as campanhas de disparo são pausadas.
- O uso aparece para o cliente em Configurações > Plano.

### Cobrança, teste grátis e primeiros passos

- **Cobrança automática (Asaas):** assinatura por empresa, fatura com Pix, boleto ou cartão. Atrasou mais de 3 dias: suspensa; pagou: volta sozinha ([`src/services/billing.service.ts`](src/services/billing.service.ts)).
- **Teste grátis de 7 dias:** botão nos planos da tela de login → `/cadastro`. Cria empresa, assinatura (1ª fatura no fim do teste) e administrador, sem cartão ([`src/services/signup.service.ts`](src/services/signup.service.ts)).
- **Lembretes pelo WhatsApp da Vórtice:** quem faz o teste vira lead no CRM da Vórtice (etiqueta "Teste grátis") e recebe boas-vindas, dica do 3º dia, lembrete do 5º, fatura no 6º e obrigado ao pagar. Textos editáveis em Painel Master > Plataforma ([`src/services/trial-messages.service.ts`](src/services/trial-messages.service.ts)).
- **Primeiros passos:** quadro no Início para o administrador de empresa nova (WhatsApp, equipe, leads, funil, respostas rápidas), que marca sozinho cada passo feito ([`src/services/onboarding.service.ts`](src/services/onboarding.service.ts)).
- **Painel Master > Vendas:** MRR (anual conta 1/12), clientes pagantes, testes em andamento, conversão do teste (90 dias), inadimplência, recebido por mês (avisos do Asaas, sem estornos) e receita por plano ([`src/services/sales-dashboard.service.ts`](src/services/sales-dashboard.service.ts)).
- **Troca de plano pelo cliente:** Configurações > Plano (administrador). Teste grátis e subir de plano valem na hora; descer vale no vencimento da fatura em aberto (a rotina da cobrança aplica). Fatura atrasada ou cobrança manual: bloqueado ([`src/services/plan-change.service.ts`](src/services/plan-change.service.ts)).
- **Campos extras do lead:** acesso (e-mail de acesso, usuário, link e senha — a senha fica em `lead_secrets`, só o servidor lê, e cada visualização vai para a auditoria), dados pessoais, endereço (CEP preenche o resto) e campos personalizados por empresa (Leads > Campos). Viram variáveis em automações, agendamentos, disparos e respostas rápidas: `{{email_acesso}}`, `{{senha_acesso}}`, `{{campo.chave}}`, `{{gerar.senha}}`... ([`src/lib/lead-fields.ts`](src/lib/lead-fields.ts)).

---

## 🏗 Arquitetura

```
 Navegador (clientes, equipe, Vórtice)      Telas públicas (totem, TV)
                     │ HTTPS                          │
                     ▼                                ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ nginx (443 → 3000)                      VPS · PM2 "vtec-os"        │
 │ ┌──────────────────────────────────────────────────────────────┐ │
 │ │ Next.js 16 + React 19 — páginas e APIs (/api/*)               │ │
 │ │ Rotinas em segundo plano (src/instrumentation.ts):            │ │
 │ │   posts agendados · esperas das automações · agendamento      │ │
 │ │   disparos · discador automático · cobrança · status          │ │
 │ │ Sessões do WhatsApp Web (Baileys) · IA local opcional (Ollama)│ │
 │ └──────────────────────────────────────────────────────────────┘ │
 └───────────────┬──────────────────────────────────┬───────────────┘
                 │                                  │
                 ▼                                  ▼
 ┌───────────────────────────────┐   ┌──────────────────────────────┐
 │ Supabase                      │   │ Serviços externos            │
 │ Postgres (dados por empresa)  │   │ Meta Graph API (WhatsApp API,│
 │ Auth · Storage · Realtime     │   │   Instagram, Messenger, posts│
 └───────────────────────────────┘   │   e webhooks) · Twilio ·     │
                                     │ Google Gemini · Banco Central│
                                     │ (PTAX) / AwesomeAPI          │
                                     └──────────────────────────────┘
```

- As rotinas em segundo plano só ligam com `NODE_ENV=production` **e** `CONTENT_SCHEDULER_ENABLED=true`. Assim elas rodam na VPS, mas não no `npm run dev` nem nos previews da Vercel (que só testam o build).
- As sessões do WhatsApp Web religam sozinhas quando o servidor sobe (desligue com `WHATSAPP_WEB_AUTOSTART=false`).
- Grupos, status e canais do WhatsApp Web são ignorados: só conversas individuais viram mensagens.

---

## 🛠 Stack

```
Runtime       Node.js 20 LTS
Framework     Next.js 16 (App Router, Route Handlers)
Frontend      React 19 + TypeScript 5, CSS Modules, Framer Motion, lucide-react
Funil/mapas   @hello-pangea/dnd (Pipeline) · @xyflow/react (Planejamentos)
Gráficos      Recharts
Banco         Supabase: Postgres, Auth (sessão por cookie), Storage, Realtime
IA            Google Gemini (padrão) ou Ollama local (AI_PROVIDER=ollama)
WhatsApp      Meta Cloud API + WhatsApp Web (@whiskeysockets/baileys)
Telefonia     Twilio (Voice SDK no navegador)
Planilhas     SheetJS (xlsx)
Imagens       jimp (posts das Redes Sociais em JPEG)
Servidor      nginx + PM2 numa VPS
```

---

## 📁 Estrutura do projeto

```
vtecos/
├── src/
│   ├── app/                  # Páginas (uma pasta por módulo) e src/app/api/* (Route Handlers)
│   │   ├── master/           # Painel Master (só a empresa da plataforma)
│   │   ├── suporte/          # Chamados (cliente e Vórtice)
│   │   ├── totem/ display/   # Telas públicas da fila de senhas
│   │   └── …                 # leads, pipeline, messages, automations, disparos, social, financeiro…
│   ├── components/           # Sidebar, Navbar, discador flutuante, barra de status, modais
│   ├── context/              # AuthContext, LeadContext
│   ├── lib/                  # Regras do servidor: plans, plan-limits, permissions, whatsapp-web,
│   │                         #   automations/, disparos/, social/, finance/, scheduling/, dialer/, status/
│   ├── services/             # Acesso ao banco por módulo (*.service.ts)
│   ├── types/                # Tipos compartilhados
│   └── instrumentation.ts    # Liga as rotinas em segundo plano
├── supabase/
│   ├── base-schema.sql       # Esquema inicial (só instalação nova)
│   └── migrations/           # Mudanças do banco, em ordem de nome
├── scripts/                  # check-tenant-scope, check-route-permissions, seed-admin, check-schema
├── docs/                     # Fluxograma em PDF
├── deploy.sh                 # Deploy para a VPS (rodar no Mac)
└── .env.example              # Modelo das variáveis de ambiente
```

---

## ⚙️ Rodar localmente

Pré-requisitos: Node.js 20 LTS, Git e um projeto no Supabase.

```bash
git clone https://github.com/gustavoadonaicardoso/vtecos.git
cd vtecos
npm install
cp .env.example .env.local   # preencha as chaves (veja abaixo)
npm run dev                  # http://localhost:3000
```

No `npm run dev` as rotinas em segundo plano ficam desligadas: posts, disparos, lembretes e esperas das automações não saem sozinhos.

---

## 🗄 Banco de dados

- **Instalação nova:** rode [`supabase/base-schema.sql`](supabase/base-schema.sql) no SQL Editor do Supabase e depois todos os arquivos de [`supabase/migrations`](supabase/migrations), em ordem de nome.
- **Produção:** a cada PR que traz migration nova, rode **só o arquivo novo** no SQL Editor **antes** do deploy. As migrations são escritas para poder rodar de novo sem estragar nada.
- Últimas migrations: `202611020001_quick_reply_shortcuts.sql` (respostas rápidas), `202611030001_internal_chat_files_bucket.sql` (anexos do Chat interno), `202611040001_billing_asaas.sql` (cobrança automática) `202611050001_lead_extra_fields.sql` (campos extras dos leads) e `202611060001_leads_phone_key.sql` (achar o lead pelo telefone em qualquer formato).
- Depois de rodar uma migration, confira o banco com `npm run db:check-schema`.

---

## 🔑 Variáveis de ambiente

O modelo completo, com comentários, está em [`.env.example`](.env.example). As principais:

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Conexão do navegador com o Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Acesso do servidor ao banco (nunca vai ao navegador) |
| `NEXT_PUBLIC_APP_URL` | Endereço público do sistema |
| `GEMINI_API_KEY` | IA da Vórtice (as empresas podem cadastrar a própria chave em Integrações) |
| `AI_PROVIDER`, `OLLAMA_URL`, `OLLAMA_MODEL` | IA local opcional na VPS |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` | App da Meta: WhatsApp API, Instagram, Messenger e Redes Sociais |
| `WHATSAPP_*` | WhatsApp Cloud API e pasta das sessões do WhatsApp Web |
| `CONTENT_SCHEDULER_ENABLED=true` | Liga as rotinas em segundo plano (só na VPS) |
| `TWILIO_*` | Discador da Vórtice (cada empresa usa a própria conta Twilio, cadastrada em Integrações) |
| `ASAAS_ENV`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | Cobrança automática das empresas pelo Asaas (melhor configurar no Painel Master > Plataforma) |

Várias configurações da plataforma também podem ser feitas no Painel Master > Plataforma, sem mexer no `.env.local`.

---

## 🚀 Deploy

Produção: VPS `179.199.143.217`, pasta `/root/vtec-os`, processo PM2 `vtec-os`, atrás do nginx com HTTPS.

**No Mac, na pasta do projeto:**

```bash
git checkout main && git pull origin main && ./deploy.sh
```

O [`deploy.sh`](deploy.sh):

1. Confere se a pasta está na `main` e atualizada com o GitHub (oferece o `git pull`).
2. Apaga a `.next` e compila do zero.
3. Monta um pacote **sem** `.next/cache` e `.next/dev` (≈ 22 MB).
4. Envia por `scp`, com até 3 tentativas, numa única conexão SSH.
5. Na VPS: abre o pacote numa pasta à parte, confere o `BUILD_ID`, roda `npm install --omit=dev` e troca `.next` e `public` de uma vez, guardando a versão anterior.
6. Reinicia o PM2 e testa `http://127.0.0.1:3000/login` por até 60 s. Se o sistema não responder, volta sozinho para a versão anterior.
7. No fim, compara o `BUILD_ID` local com o da VPS.

Use `./deploy.sh --sem-git` para pular a conferência do GitHub. Depois do deploy, recarregue o navegador com Cmd + Shift + R.

**nginx:** mantenha `proxy_set_header X-Forwarded-Proto $scheme;` no bloco do site. Sem ele, o "Conectar com Facebook" monta o endereço de retorno com `http` e a Meta recusa.

**Problemas comuns:**

| Sintoma | O que fazer |
|---|---|
| A mudança não apareceu | Conferir se o deploy terminou com o mesmo `BUILD_ID` e recarregar com Cmd + Shift + R |
| Tela nova com "Acesso negado" | O módulo não está no plano da empresa, ou a migration não foi rodada |
| Posts, disparos ou lembretes não saem | Conferir `CONTENT_SCHEDULER_ENABLED=true` e `pm2 logs vtec-os` |
| WhatsApp Web desconectado | Integrações > WhatsApp > ler o QR Code de novo |

---

## ✅ Verificações

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Sobe o build (porta 3000) |
| `npm run lint` | ESLint |
| `npm run check:tenant-scope` | Garante que toda consulta do servidor filtra pela empresa (exceções marcadas com `// tenant-scope: ok`) |
| `npm run check:permissions` | Garante que toda rota de API checa uma permissão |
| `npm run db:seed-admin` | Cria o primeiro administrador |
| `npm run db:check-schema` | Confere se o banco tem as tabelas esperadas |

Antes de abrir uma PR: `npx tsc --noEmit`, `npm run lint`, os dois `check:*` e `npm run build`.

---

## 🔐 Segurança

- **Separação por empresa:** toda consulta do servidor filtra `tenant_id`, conferido pelo `check:tenant-scope`.
- **Sessão no servidor:** login pelo Supabase Auth com cookie; as APIs checam sessão e permissão (`check:permissions`).
- **Chaves só no servidor:** `SUPABASE_SERVICE_ROLE_KEY`, tokens da Meta, do Twilio e do Gemini nunca vão ao navegador.
- **Webhooks assinados:** Meta e Twilio só são aceitos com assinatura válida.
- **Modo suporte auditado:** a Vórtice só entra na empresa de um cliente informando o motivo, que fica registrado.
- **Cabeçalhos HTTP** de segurança em `next.config.ts` e HTTPS no nginx.

---

<div align="center">
  <sub>© 2026 <a href="https://vorticetecnologia.com.br">Vórtice Tecnologia</a> · Todos os direitos reservados</sub>
</div>
