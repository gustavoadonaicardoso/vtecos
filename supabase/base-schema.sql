-- ============================================================
-- Esquema inicial do vtec os (instalação nova)
-- ============================================================
-- Rode UMA vez num projeto Supabase vazio, ANTES das migrations de
-- supabase/migrations (em ordem de nome). Em produção ele já foi
-- aplicado; não rode de novo lá. As migrations ligam o RLS, separam
-- os dados por empresa e criam o resto das tabelas.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Estágios do Funil / Pipeline
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

-- 2. Perfis de Usuário
CREATE TABLE IF NOT EXISTS profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'SELLER',
  status TEXT DEFAULT 'ACTIVE',
  permissions JSONB DEFAULT '{}',
  allowed_templates TEXT[] DEFAULT '{}',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Leads (Contatos / Oportunidades)
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf_cnpj TEXT,
  value NUMERIC DEFAULT 0,
  stage_id TEXT NOT NULL REFERENCES pipeline_stages(id),
  tags TEXT[] DEFAULT '{}',
  last_msg TEXT,
  source TEXT DEFAULT 'Manual',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  wait_time_minutes INTEGER DEFAULT 0,
  handling_time_minutes INTEGER DEFAULT 0,
  channels TEXT[] DEFAULT '{}',
  last_activity_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Mensagens de Chat com Leads (Meta / WhatsApp Web)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  text TEXT,
  sent_by_me BOOLEAN DEFAULT FALSE,
  type TEXT DEFAULT 'text',
  audio_url TEXT,
  status TEXT DEFAULT 'sent',
  external_id TEXT,
  provider TEXT,
  phone_number_id TEXT,
  raw_payload JSONB,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Logs de Auditoria
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

-- 6. Configurações de Integração (Meta / WhatsApp Web / Webhook)
CREATE TABLE IF NOT EXISTS integrations_config (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  config JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Notificações do Sistema (Demandas, Chat, Alertas)
CREATE TABLE IF NOT EXISTS system_notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'chat' | 'automation' | 'lead' | 'task' | 'system'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Campanhas em Massa (Disparos/Blast)
CREATE TABLE IF NOT EXISTS blast_campaigns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  columns_config JSONB DEFAULT '[]',
  delay_min INTEGER DEFAULT 3,
  delay_max INTEGER DEFAULT 8,
  status TEXT DEFAULT 'draft',
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  route_type TEXT DEFAULT 'none',
  route_to_id TEXT,
  route_to_label TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blast_contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  campaign_id UUID REFERENCES blast_campaigns(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  rendered_message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_msg TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Chat Interno (Comunicação da Equipe)
CREATE TABLE IF NOT EXISTS internal_chat (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  is_edited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_groups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_group_members (
  group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_group_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Desativa RLS para simplificação/compatibilidade local
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE integrations_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE blast_campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE blast_contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE internal_chat DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_messages DISABLE ROW LEVEL SECURITY;
