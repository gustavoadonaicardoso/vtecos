-- Bucket público pra anexos de mensagem (arquivos e áudios enviados/
-- recebidos via WhatsApp). Todo upload passa pelo servidor
-- (supabaseAdmin, em /api/whatsapp/web/send-media), então não precisa
-- de policy de INSERT pro cliente -- service role já ignora RLS do
-- Storage. Bucket público só pra permitir que o próprio WhatsApp
-- (Meta/WhatsApp Web) busque a URL do arquivo pra entregar a mídia.

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;
