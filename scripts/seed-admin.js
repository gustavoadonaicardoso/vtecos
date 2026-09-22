#!/usr/bin/env node
/**
 * ============================================================
 * VÓRTICE CRM — Seed do primeiro usuário ADMIN
 * ============================================================
 * Cria o primeiro usuário administrador num banco novo. Usa o
 * mesmo caminho da rota /api/users (Supabase Auth admin API), então
 * a senha nunca passa em texto puro pela tabela profiles — o
 * trigger handle_new_auth_user cria o perfil automaticamente com
 * role SELLER, e este script promove esse perfil para ADMIN.
 *
 * Uso:
 *   node scripts/seed-admin.js "Nome Completo" email@dominio.com SenhaForte123
 *
 * Requer no .env.local (ou no ambiente):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const { loadEnvLocal } = require('./lib/load-env');

loadEnvLocal();

async function main() {
  const [, , name, email, password] = process.argv;

  if (!name || !email || !password) {
    console.error('Uso: node scripts/seed-admin.js "Nome Completo" email@dominio.com SenhaForte123');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ A senha deve ter pelo menos 8 caracteres.');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias (verifique .env.local).'
    );
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Criando usuário de autenticação para ${email}...`);

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (authError || !authData.user) {
    console.error('❌ Falha ao criar usuário:', authError?.message ?? 'erro desconhecido');
    process.exit(1);
  }

  console.log('Promovendo perfil a ADMIN...');

  // O trigger handle_new_auth_user já criou a linha em profiles com role
  // SELLER; aqui só promovemos para ADMIN.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ role: 'ADMIN', status: 'ACTIVE' })
    .eq('id', authData.user.id);

  if (profileError) {
    console.error('❌ Usuário criado, mas falhou ao promover a ADMIN:', profileError.message);
    console.error(`   Rode manualmente: update profiles set role = 'ADMIN' where id = '${authData.user.id}';`);
    process.exit(1);
  }

  console.log(`✅ Administrador criado com sucesso: ${email}`);
}

main().catch((err) => {
  console.error('❌ Erro inesperado:', err.message || err);
  process.exit(1);
});
