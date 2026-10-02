-- ============================================================
-- VÓRTICE CRM — Mídia (anúncios/imagens/vídeos) no Painel de Senhas
-- ============================================================
-- queue_display_media: a playlist exibida no /display enquanto as
-- senhas não estão sendo chamadas. Só o servidor lê e grava (RLS sem
-- policy + revoke); o Display, que é público, recebe a playlist pela
-- rota /api/queue/display.
-- queue_settings.display_config: rotina de exibição (tela inteira /
-- minimizada / oculta e por quanto tempo) e quanto tempo a mídia some
-- quando uma senha é chamada.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.queue_display_media (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('image', 'video')),
  url text not null,
  storage_path text,
  title text not null default '',
  duration_seconds integer not null default 10 check (duration_seconds between 3 and 600),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists queue_display_media_position_idx on public.queue_display_media (position);

alter table public.queue_display_media enable row level security;
revoke all on public.queue_display_media from anon, authenticated;

alter table public.queue_settings add column if not exists display_config jsonb;

-- Público porque a TV do painel carrega as imagens/vídeos direto pela URL.
-- Upload só pelo servidor (URL assinada gerada em /api/queue/media/upload-url).
insert into storage.buckets (id, name, public, file_size_limit)
values ('queue-media', 'queue-media', true, 104857600)
on conflict (id) do update set public = true, file_size_limit = 104857600;

notify pgrst, 'reload schema';
