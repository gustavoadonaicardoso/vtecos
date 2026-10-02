"use client";

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  BookOpen, 
  Zap, 
  MessageCircle, 
  Shield, 
  CheckCircle,
  PlayCircle,
  FileText,
  Share2
} from 'lucide-react';
import styles from '../help.module.css';

const ARTICLES_CONTENT: Record<string, any> = {
  'primeiros-passos': {
    title: 'Primeiros Passos no Vórtice',
    icon: Zap,
    color: '#3b82f6',
    content: [
      { title: '1. Configure seu Perfil', text: 'Acesse as configurações e preencha seus dados de administrador. É essencial para que o sistema identifique suas ações.' },
      { title: '2. Personalize sua Marca', text: 'No Painel Master, envie seu logotipo e defina as cores do sistema para que a plataforma tenha a identidade da sua empresa.' },
      { title: '3. Importe seus Primeiros Leads', text: 'Você pode adicionar leads manualmente ou conectar um webhook para captura automática.' }
    ]
  },
  'gestao-de-leads': {
    title: 'Dominando a Gestão de Leads',
    icon: BookOpen,
    color: '#10b981',
    content: [
      { title: 'Funil SSD', text: 'Aprenda a movimentar seus leads entre as etapas de Estruturação, Escala e Domínio.' },
      { title: 'Tags e Filtros', text: 'Utilize tags para segmentar leads por origem ou interesse. Isso facilita a exportação e análise.' },
      { title: 'Histórico Completo', text: 'Cada interação com o lead é registrada. Use as notas para não perder nenhum detalhe do atendimento.' }
    ]
  },
  'automacoes': {
    title: 'Potencializando com Automações',
    icon: MessageCircle,
    color: '#25D366',
    content: [
      { title: 'Templates de Mensagem', text: 'Crie modelos pré-aprovados pela Meta para garantir que seus disparos cheguem com 100% de taxa de entrega.' },
      { title: 'Regras de Disparo', text: 'Configure o CRM para enviar um WhatsApp automático assim que um lead entrar em uma etapa específica do funil.' },
      { title: 'Webhooks de Resposta', text: 'Sincronize as respostas dos leads com seus sistemas externos em tempo real.' }
    ]
  },
  'conectar-redes-sociais': {
    title: 'Conectar Instagram e Facebook',
    icon: Share2,
    color: '#E4405F',
    content: [
      { title: '1. Prepare as contas', text: 'O Instagram precisa ser uma conta profissional (Empresa ou Criador de conteúdo) e estar vinculado a uma Página do Facebook. Você faz isso no app do Instagram em Configurações → Tipo de conta e ferramentas, e depois em Central de Contas → vincular à Página.' },
      { title: '2. Crie o app na Meta', text: 'Acesse developers.facebook.com, clique em Criar app, escolha o tipo Empresa e vincule ao portfólio empresarial (Business Manager) da empresa.' },
      { title: '3. Adicione os produtos', text: 'No painel do app, adicione "Login do Facebook para Empresas" e "Instagram" (API com login do Facebook).' },
      { title: '4. Cadastre o endereço de retorno', text: 'Em Login do Facebook → Configurações, adicione em "URIs de redirecionamento do OAuth válidos": https://app.vorticetecnologia.com.br/api/social/oauth/callback (e, se for testar no seu computador, http://localhost:3000/api/social/oauth/callback).' },
      { title: '5. Preencha os dados básicos', text: 'Em Configurações do app → Básico, informe a URL da Política de Privacidade (https://app.vorticetecnologia.com.br/politica-de-privacidade), um ícone e a categoria. Copie o ID do app e a Chave secreta do app.' },
      { title: '6. Configure o servidor', text: 'No arquivo .env.local adicione META_APP_ID (ID do app), META_APP_SECRET (chave secreta) e CONTENT_SCHEDULER_ENABLED=true, e rode o deploy. Opcionais: META_OAUTH_REDIRECT_URI para fixar o endereço de retorno e META_LOGIN_CONFIG_ID se você criar uma configuração no Login do Facebook para Empresas.' },
      { title: '7. Conecte no Vórtice', text: 'Em Redes Sociais → Contas, clique em Conectar com Facebook, entre com um perfil que administra a Página e marque a Página e o Instagram vinculado. Enquanto o app estiver em modo de desenvolvimento, só funcionam contas de pessoas com função no app — que é o caso das contas da própria empresa.' },
      { title: 'E para contas de clientes?', text: 'Para gerenciar Páginas e Instagrams de clientes, a Meta exige a verificação da empresa e a Análise do App (App Review) das permissões de publicação. O processo leva de dias a semanas e não muda nada no Vórtice: depois de aprovado, é só conectar as contas.' },
    ]
  },
  'seguranca-e-conta': {
    title: 'Segurança e Auditoria',
    icon: Shield,
    color: '#ef4444',
    content: [
      { title: 'Logs de Auditoria', text: 'Acompanhe quem fez o quê e quando. Toda alteração crítica é registrada para sua segurança.' },
      { title: 'Níveis de Acesso', text: 'Defina quem pode ver dados sensíveis e quem pode deletar leads ou alterar configurações.' },
      { title: 'Backup de Dados', text: 'Seus dados estão protegidos no banco de dados Supabase com criptografia de ponta a ponta.' }
    ]
  }
};

export default function ArticlePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const article = ARTICLES_CONTENT[slug];

  if (!article) {
    return (
      <div className={styles.container} style={{ textAlign: 'center', padding: '10rem 2rem' }}>
        <h2>Artigo não encontrado</h2>
        <button onClick={() => router.push('/help')} className={styles.primaryBtn} style={{ marginTop: '1rem' }}>Voltar ao Suporte</button>
      </div>
    );
  }

  const Icon = article.icon;

  return (
    <div className={styles.container}>
      <button className={styles.backBtn} onClick={() => router.push('/help')}>
        <ArrowLeft size={18} /> Voltar para o Suporte
      </button>

      <motion.div 
        className={styles.articleHeader}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.articleIcon} style={{ background: `${article.color}22`, color: article.color }}>
          <Icon size={32} />
        </div>
        <h1>{article.title}</h1>
        <p>Aprenda detalhadamente como utilizar este recurso para escalar sua operação.</p>
      </motion.div>

      <div className={styles.articleGrid}>
        <div className={styles.articleBody}>
          {article.content.map((section: any, idx: number) => (
            <motion.div 
              key={idx} 
              className={styles.articleSection}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className={styles.sectionHeader}>
                 <CheckCircle size={20} color={article.color} />
                 <h3>{section.title}</h3>
              </div>
              <p>{section.text}</p>
            </motion.div>
          ))}

          <div className={styles.proTip}>
            <Zap size={20} />
            <div>
              <strong>Dica de Especialista:</strong>
              <p>Utilize sempre tags descritivas. Isso ajudará você a criar filtros precisos no futuro.</p>
            </div>
          </div>
        </div>

        <aside className={styles.articleSidebar}>
          <div className={styles.sidebarCard}>
            <h4>Vídeos Relacionados</h4>
            <div className={styles.videoItem}>
              <PlayCircle size={20} />
              <span>Tutorial em Vídeo (3min)</span>
            </div>
          </div>

          <div className={styles.sidebarCard}>
            <h4>Arquivos para Download</h4>
            <div className={styles.videoItem}>
              <FileText size={20} />
              <span>Manual em PDF (V2.1)</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
