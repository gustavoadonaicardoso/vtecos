import { redirect } from 'next/navigation';

// Os banners são editados na aba "Banners" do Painel Master. A tela antiga
// regravava todos os banners com colunas que o Início não lê.
export default function AdminBannersPage() {
  redirect('/master');
}
