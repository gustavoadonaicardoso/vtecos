<div align="center">

```
██╗   ██╗ ██████╗ ██████╗ ████████╗██╗ ██████╗███████╗
██║   ██║██╔═══██╗██╔══██╗╚══██╔══╝██║██╔════╝██╔════╝
██║   ██║██║   ██║██████╔╝   ██║   ██║██║     █████╗  
╚██╗ ██╔╝██║   ██║██╔══██╗   ██║   ██║██║     ██╔══╝  
 ╚████╔╝ ╚██████╔╝██║  ██║   ██║   ██║╚██████╗███████╗
  ╚═══╝   ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝╚══════╝
                    C  R  M
```

**Plataforma comercial completa para equipes de vendas modernas.**  
Gestão de leads, pipeline visual, WhatsApp, campanhas, IA fiscal e muito mais.

<br/>

![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase_São_Paulo-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![VPS](https://img.shields.io/badge/Servidor-Locaweb_VPS-FF6B35?style=flat-square)
![Status](https://img.shields.io/badge/Status-Produção-10b981?style=flat-square)

<br/>

[Módulos](#-módulos) · [Arquitetura](#-arquitetura) · [Instalação Local](#-instalação-local) · [Deploy VPS](#-deploy-na-vps-locaweb) · [Variáveis de Ambiente](#-variáveis-de-ambiente) · [Atualizações](#-publicar-atualizações)

</div>

---

## 📌 Sobre o Projeto

O **Vórtice CRM** é uma plataforma B2B de gestão comercial desenvolvida pela [Vórtice Tecnologia](https://vorticetecnologia.com.br). Construída para equipes de vendas que precisam de velocidade, controle e inteligência em um único sistema.

A infraestrutura é **100% brasileira**: aplicação hospedada em VPS Locaweb e banco de dados no Supabase com servidor físico em São Paulo — em conformidade com os requisitos de soberania de dados de órgãos públicos e prefeituras.

---

## ✨ Módulos

| Módulo | Descrição |
|--------|-----------|
| 🎯 **Pipeline** | Kanban visual com drag & drop, stages customizáveis e atualização em tempo real |
| 👥 **Leads** | Cadastro completo, tags, filtros avançados, histórico e exportação |
| 💬 **Chat** | Atendimento via WhatsApp (Z-API) com histórico persistido no banco |
| 📣 **Disparos** | Campanhas em massa com upload de planilha XLSX, templates e roteamento automático |
| 📨 **Messages** | Caixa unificada com templates de mensagem e variáveis dinâmicas |
| 🧾 **Fiscal** | Geração e análise de documentos fiscais com IA (Google Gemini) |
| ⚙️ **Automações** | Fluxos automáticos baseados em gatilhos do pipeline |
| 📊 **Relatórios** | KPIs, funil de conversão e atividades da equipe |
| 🏢 **Usuários** | Gestão de time com roles (Admin / Manager / Seller) e permissões granulares |
| 🔌 **Integrações** | Z-API (WhatsApp), Meta (Instagram/Messenger), WhatsApp Business API |
| 🗓️ **Agendamentos** | Fila de atendimento e scheduling |
| 🔐 **Admin** | Banners, logs de auditoria completos e configurações globais |
| 👑 **Master** | Painel super admin para gestão multi-tenant |

---

## 🏗 Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                    USUÁRIO FINAL                    │
│           (navegador — qualquer dispositivo)        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────┐
│              NGINX — Proxy Reverso                  │
│                  VPS Locaweb                        │
│              Servidor: São Paulo, BR                │
└──────────────────────┬──────────────────────────────┘
                       │ localhost:3000
                       ▼
┌─────────────────────────────────────────────────────┐
│           NEXT.JS 16 — App Router                   │
│         PM2 — Process Manager (24/7)                │
│                                                     │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │  Frontend    │    │  API Routes (Server-side)  │  │
│  │  React 19    │    │  /api/leads               │  │
│  │  CSS Modules │    │  /api/auth                │  │
│  │  Framer      │    │  /api/disparos            │  │
│  │  Motion      │    │  /api/fiscal              │  │
│  └──────────────┘    │  /api/webhooks            │  │
│                      └───────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ TLS / HTTPS
                       ▼
┌─────────────────────────────────────────────────────┐
│              SUPABASE — São Paulo, BR               │
│              (AWS sa-east-1)                        │
│                                                     │
│  PostgreSQL · Realtime · Auth · Storage             │
│                                                     │
│  Tabelas: leads · pipeline_stages · profiles        │
│           chat_messages · audit_logs                │
│           integrations_config · blast_campaigns     │
└─────────────────────────────────────────────────────┘
```

> ✅ Dados armazenados fisicamente no Brasil — conformidade com LGPD e requisitos de soberania de dados para órgãos públicos e prefeituras.

---

## 🛠 Stack Técnica

```
Runtime         Node.js 20 LTS
Framework       Next.js 16 (App Router + SSR + API Routes)
Frontend        React 19 + TypeScript 5
Estilo          CSS Modules + Framer Motion
Drag & Drop     @hello-pangea/dnd
Gráficos        Recharts
Banco           Supabase (PostgreSQL 15) — região São Paulo
Realtime        Supabase Realtime (WebSockets)
Auth            JWT + localStorage session
IA              Google Gemini 2.0 Flash
WhatsApp        Z-API
Planilhas       SheetJS (xlsx)
Servidor        Nginx + PM2
Hospedagem      VPS Locaweb — Brasil
```

---

## 📁 Estrutura do Projeto

```
vortice-crm/
├── src/
│   ├── app/
│   │   ├── api/                    # Route Handlers (server-side only)
│   │   │   ├── auth/               # login · logout · refresh
│   │   │   ├── leads/              # CRUD de leads
│   │   │   ├── disparos/           # campanhas · templates · upload
│   │   │   ├── messages/           # templates de mensagem
│   │   │   ├── fiscal/             # geração IA + exportação CSV
│   │   │   ├── webhooks/z-api/     # recebimento de mensagens
│   │   │   └── audit/              # log de auditoria
│   │   ├── pipeline/               # Kanban visual
│   │   ├── leads/                  # Listagem e gestão
│   │   ├── chat/                   # Atendimento WhatsApp
│   │   ├── messages/               # Caixa unificada
│   │   ├── disparos/               # Campanhas em massa
│   │   ├── fiscal/                 # Módulo fiscal com IA
│   │   ├── automations/            # Fluxos de automação
│   │   ├── relatorios/             # Dashboard e KPIs
│   │   ├── users/                  # Gestão de equipe
│   │   ├── settings/               # Configurações
│   │   ├── integrations/           # Painel de integrações
│   │   ├── admin/                  # Área administrativa
│   │   └── master/                 # Super admin
│   ├── components/                 # Sidebar · Navbar · Modais
│   ├── context/                    # AuthContext · LeadContext
│   ├── hooks/                      # usePermissions · useNotifications
│   ├── lib/                        # supabase · gemini · zapi · audit
│   ├── services/                   # auth.service · leads.service
│   └── types/                      # Interfaces TypeScript centralizadas
├── .env.local                      # ⚠️ Variáveis secretas (não commitado)
├── .env.example                    # Template das variáveis
├── next.config.ts                  # Headers de segurança + domínios
├── package.json
└── tsconfig.json
```

---

## ⚙️ Instalação Local

### Pré-requisitos

- [Node.js 20 LTS](https://nodejs.org)
- [Git](https://git-scm.com)
- Conta no [Supabase](https://supabase.com) (gratuita)

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/vortice-crm.git
cd vortice-crm
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env.local
# Edite o .env.local com suas chaves (veja seção abaixo)
```

### 4. Configure o banco (Supabase)

No painel do Supabase → **SQL Editor** → execute o script abaixo:

<details>
<summary>Ver SQL completo de criação do banco</summary>

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf_cnpj TEXT,
  value NUMERIC DEFAULT 0,
  stage_id TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  last_msg TEXT,
  source TEXT DEFAULT 'Manual',
  assigned_to UUID,
  wait_time_minutes INTEGER DEFAULT 0,
  handling_time_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER NOT NULL
);

INSERT INTO pipeline_stages (id, name, color, position) VALUES
('novo',       'Novos Leads',      '#3b82f6', 1),
('contato',    'Primeiro Contato', '#8b5cf6', 2),
('proposta',   'Proposta Enviada', '#8b5cf6', 3),
('negociacao', 'Negociação',       '#f59e0b', 4),
('ganho',      'Ganhos',           '#10b981', 5)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'SELLER',
  status TEXT DEFAULT 'ACTIVE',
  permissions JSONB DEFAULT '{}',
  allowed_templates TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  text TEXT,
  sent_by_me BOOLEAN DEFAULT FALSE,
  type TEXT DEFAULT 'text',
  audio_url TEXT,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID,
  user_name TEXT,
  action TEXT NOT NULL,
  details TEXT,
  entity_type TEXT,
  entity_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrations_config (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  config JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE integrations_config DISABLE ROW LEVEL SECURITY;
```

</details>

### 5. Rode localmente

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

---

## 🔑 Variáveis de Ambiente

Crie o arquivo `.env.local` na raiz do projeto:

```env
# ── Supabase ──────────────────────────────────────────────────────
# Obtenha em: Project Settings > API

# URL do projeto
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co

# Chave pública (usada no frontend)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5c...

# Chave secreta (usada apenas nas API Routes — NUNCA expor no frontend)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5c...

# ── Google Gemini ─────────────────────────────────────────────────
# Obtenha em: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIzaSy...
```

> ⚠️ `.env.local` está no `.gitignore` e **nunca deve ser commitado**.

---

## 🚀 Deploy na VPS Locaweb

### Pré-requisitos no servidor

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# PM2 — mantém o processo rodando 24/7
npm install -g pm2

# Nginx — proxy reverso
apt-get install -y nginx
```

### 1. Clonar e instalar

```bash
cd /var/www
git clone https://github.com/seu-usuario/vortice-crm.git
cd vortice-crm
npm install
```

### 2. Variáveis de ambiente na VPS

```bash
nano .env.local
# Cole as variáveis · Salvar: Ctrl+X → Y → Enter
```

### 3. Build e inicialização com PM2

```bash
npm run build
pm2 start npm --name "vortice-crm" -- start
pm2 save
pm2 startup
# Execute o comando gerado pelo pm2 startup
```

### 4. Configurar Nginx

```bash
nano /etc/nginx/sites-available/vortice-crm
```

```nginx
server {
    listen 80;
    server_name SEU_DOMINIO_OU_IP;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/vortice-crm /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```

### 5. HTTPS com Let's Encrypt

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d crm.seudominio.com.br
```

---

## 🔄 Publicar Atualizações

**Máquina local — enviar alterações:**
```bash
git add .
git commit -m "descrição da alteração"
git push
```

**VPS — aplicar em produção:**
```bash
cd /var/www/vortice-crm
git pull
npm run build
pm2 restart vortice-crm
```

---

## 🔐 Segurança

- **Dados no Brasil** — banco hospedado na AWS `sa-east-1` (São Paulo) via Supabase. Conformidade com LGPD e exigências de soberania de dados para órgãos públicos
- **Chaves server-only** — `SUPABASE_SERVICE_ROLE_KEY` e `GEMINI_API_KEY` processadas exclusivamente no servidor, nunca expostas ao browser
- **Headers HTTP** — `X-Frame-Options DENY`, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy` configurados em `next.config.ts`
- **Auditoria completa** — todas as ações (login, logout, criação/edição/exclusão de leads) registradas na tabela `audit_logs` com usuário, timestamp e detalhes
- **Permissões granulares** — controle por rota e por feature (`dashboard.view`, `leads.delete`, `admin.root`, etc.) para cada perfil de usuário
- **HTTPS** — certificado SSL gratuito via Let's Encrypt com renovação automática a cada 90 dias

---

## 📜 Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento com hot-reload |
| `npm run build` | Compilação otimizada para produção |
| `npm run start` | Inicia o servidor em modo produção |
| `npm run lint` | Verifica erros de lint e tipagem |
| `npm run db:seed-admin` | Cria o usuário administrador inicial |
| `npm run db:check-schema` | Verifica consistência do schema do banco |

---

## 🏢 Sobre

Desenvolvido pela **[Vórtice Tecnologia](https://vorticetecnologia.com.br)**  
Especialista em estratégia comercial, CRM e treinamento de equipes de vendas.

---

<div align="center">
  <sub>© 2026 Vórtice Tecnologia · Todos os direitos reservados</sub>
</div>
