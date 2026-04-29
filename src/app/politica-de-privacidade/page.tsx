import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidade | Vórtice CRM',
  description: 'Nossa política de privacidade e proteção de dados.',
};

export default function PoliticaPrivacidade() {
  return (
    <div style={{ 
      padding: '60px 20px', 
      maxWidth: '800px', 
      margin: '0 auto', 
      fontFamily: 'var(--font-inter, sans-serif)',
      lineHeight: '1.6',
      color: 'var(--foreground, #333)'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '20px' }}>Política de Privacidade</h1>
      
      <p style={{ marginBottom: '20px' }}>
        A sua privacidade é importante para nós. É política do Vórtice CRM respeitar a sua privacidade em relação a qualquer 
        informação sua que possamos coletar no nosso site e em outros sites que possuímos e operamos.
      </p>

      <p style={{ marginBottom: '20px' }}>
        Trabalhamos em conformidade com as leis de proteção de dados e nos comprometemos 
        com a segurança e transparência no tratamento das suas informações pessoais.
      </p>

      <div style={{ marginTop: '40px', padding: '20px', borderTop: '1px solid #eaeaea' }}>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '15px' }}>Nosso Compromisso com a Privacidade</h3>
        <p style={{ marginBottom: '15px', color: '#666' }}>
          Consulte nosso portal de privacidade para mais detalhes:
        </p>
        
        {/* Selo DPOnet / Privacidade.com.br adicionado conforme solicitação */}
        <a 
          href='https://www.privacidade.com.br/portal-de-privacidade?token=13a59ac8e038e06f0049d6a15264b2bf' 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ display: 'inline-block' }}
        >
          <img 
            src='https://api.dponet.com.br/selo_portal_de_privacidade.png' 
            alt='Selo Portal de Privacidade' 
            style={{ maxWidth: '150px', height: 'auto' }}
          />
        </a>
      </div>

      <div style={{ marginTop: '40px' }}>
        <Link 
          href="/" 
          style={{ 
            color: '#3b82f6', 
            textDecoration: 'none', 
            fontWeight: '500',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          &larr; Voltar
        </Link>
      </div>
    </div>
  );
}
