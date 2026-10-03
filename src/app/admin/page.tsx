import { redirect } from 'next/navigation';

// O antigo hub /admin foi incorporado ao Painel Master.
export default function AdminPage() {
  redirect('/master');
}
