import { redirect } from 'next/navigation';

// Os projetos ficam em /projetos (esta era uma cópia antiga da mesma tela).
export default function AdminProjetosPage() {
  redirect('/projetos');
}
