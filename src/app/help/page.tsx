"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  Search, 
  Book, 
  MessageCircle, 
  Zap, 
  Shield, 
  ChevronRight,
  ExternalLink,
  LifeBuoy,
  LayoutGrid
} from 'lucide-react';
import styles from './help.module.css';

const CATEGORIES = [
  { title: 'Primeiros Passos', icon: Zap, desc: 'Aprenda o básico para configurar seu CRM em minutos.', slug: 'primeiros-passos' },
  { title: 'Gestão de Leads', icon: Book, desc: 'Como capturar, organizar e converter leads no funil SSD.', slug: 'gestao-de-leads' },
  { title: 'Automações', icon: MessageCircle, desc: 'Configure fluxos de WhatsApp e e-mail automático.', slug: 'automacoes' },
  { title: 'Segurança & Conta', icon: Shield, desc: 'Gerencie permissões, usuários e dados da empresa.', slug: 'seguranca-e-conta' }
];

const FAQS = [
  { q: 'Como conectar meu WhatsApp Business?', a: 'Vá em Integrações > WhatsApp e escaneie o QR Code com seu celular.' },
  { q: 'O que é o método SSD?', a: 'É nossa metodologia proprietária: Estruturar, Escalar e Dominar seu mercado.' },
  { q: 'Posso exportar meus dados?', a: 'Sim, você pode exportar para CSV ou Google Sheets a qualquer momento.' }
];

export default function HelpCenter() {
  const [search, setSearch] = useState('');
  const router = useRouter();

  return (
    <div className={styles.container}>
      <header className={styles.helpHeader}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className={styles.badge}>
            <LifeBuoy size={14} /> Suporte Vórtice
          </div>
          <h1>Como podemos ajudar hoje?</h1>
          <div className={styles.searchBox}>
            <Search size={20} className={styles.searchIcon} />
            <input 
              type="text" 
              placeholder="Pesquisar artigos, tutoriais e soluções..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </motion.div>
      </header>

      <section className={styles.categories}>
        {CATEGORIES.map((cat, i) => (
          <motion.div 
            key={cat.title}
            className={styles.catCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => router.push(`/help/${cat.slug}`)}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.catIcon}>
              <cat.icon size={24} />
            </div>
            <h3>{cat.title}</h3>
            <p>{cat.desc}</p>
            <button className={styles.learnMore}>
              Ver artigos <ChevronRight size={16} />
            </button>
          </motion.div>
        ))}
      </section>

      <section className={styles.tutorialsSection}>
        <h2 className={styles.sectionTitle}>Tutoriais de Integração</h2>
        <div className={styles.tutorialGrid}>
          {/* Tutorial Meta */}
          <motion.div 
            className={styles.tutorialCard}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className={styles.tutorialHeader}>
              <div className={styles.metaIcon}>
                <LayoutGrid size={24} />
              </div>
              <div>
                <h4>WhatsApp Oficial (Meta)</h4>
                <span>Escalabilidade e Segurança</span>
              </div>
            </div>
            <div className={styles.tutorialSteps}>
              <div className={styles.step}>
                <span className={styles.stepNum}>1</span>
                <p>Crie um aplicativo no portal <strong>Meta for Developers</strong> e adicione o produto WhatsApp.</p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNum}>2</span>
                <p>Gere um <strong>Token de Acesso Permanente</strong> através de um Usuário do Sistema na sua BM.</p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNum}>3</span>
                <p>Copie o <strong>ID do Número de Telefone</strong> e o <strong>ID da Conta Business</strong> no painel da Meta.</p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNum}>4</span>
                <p>Vá em <strong>Integrações</strong> no Vórtice e clique em "Conectar" no card da Meta.</p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNum}>5</span>
                <p>Cole as chaves, clique em <strong>Testar Conexão</strong> e pronto!</p>
              </div>
            </div>
            <button className={styles.tutorialBtn}>Abrir Documentação Meta <ExternalLink size={14} /></button>
          </motion.div>

          {/* Tutorial Z-API */}
          <motion.div 
            className={styles.tutorialCard}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={styles.tutorialHeader}>
              <div className={styles.zapiIcon}>
                <Zap size={24} />
              </div>
              <div>
                <h4>Z-API (WhatsApp Gateway)</h4>
                <span>Conexão Rápida e Simples</span>
              </div>
            </div>
            <div className={styles.tutorialSteps}>
              <div className={styles.step}>
                <span className={styles.stepNum}>1</span>
                <p>Acesse sua conta no painel da <strong>z-api.io</strong> e selecione sua instância ativa.</p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNum}>2</span>
                <p>Garanta que o status esteja como <strong>CONNECTED</strong> após ler o QR Code com seu WhatsApp.</p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNum}>3</span>
                <p>Localize o <strong>ID da Instância</strong> e o <strong>Token</strong> na aba de Configurações da Z-API.</p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNum}>4</span>
                <p>No Hub de Integrações do Vórtice, escolha a opção <strong>Z-API</strong>.</p>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNum}>5</span>
                <p>Insira os dados, salve e o sistema começará a operar instantaneamente!</p>
              </div>
            </div>
            <button className={styles.tutorialBtn}>Visitar Painel Z-API <ExternalLink size={14} /></button>
          </motion.div>
        </div>
      </section>

      <div className={styles.mainGrid}>
        <section className={styles.faqSection}>
          <h2 className={styles.sectionTitle}>Perguntas Frequentes</h2>
          <div className={styles.faqList}>
            {FAQS.map((faq, i) => (
              <div key={i} className={styles.faqItem}>
                <h4>{faq.q}</h4>
                <p>{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.contactSupport}>
          <div className={styles.supportCard}>
            <h3>Ainda precisa de ajuda?</h3>
            <p>Nossa equipe de especialistas está pronta para ajudar você a escalar sua operação.</p>
            <div className={styles.contactButtons}>
              <button className={styles.primaryBtn}>
                <MessageCircle size={18} /> Abrir Ticket
              </button>
              <button className={styles.secondaryBtn}>
                Falar no WhatsApp <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>

      <div style={{ textAlign: 'center', marginTop: '40px', paddingBottom: '20px' }}>
        <a 
          href="/politica-de-privacidade" 
          style={{ color: '#888', fontSize: '13px', textDecoration: 'none', transition: 'color 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.color = '#555'}
          onMouseOut={(e) => e.currentTarget.style.color = '#888'}
        >
          Política de Privacidade
        </a>
      </div>
    </div>
  );
}
