"use client";

import React, { useState } from 'react';
import { useLeads } from '@/context/LeadContext';
import styles from './NewLeadModal.module.css';
import { X, Plus, Terminal } from 'lucide-react';

const NewLeadModal = () => {
  const { isModalOpen, closeModal, addLead, pipelineStages } = useLeads();

  const [formData, setFormData] = useState({
    name: '',
    cpfCnpj: '',
    email: '',
    phone: '',
    pipelineStage: pipelineStages[0]?.id || 'new'
  });

  const [currentTag, setCurrentTag] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  if (!isModalOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddTag = () => {
    if (currentTag.trim() && !tags.includes(currentTag.trim())) {
      setTags([...tags, currentTag.trim()]);
      setCurrentTag('');
    }
  };

  const handleKeyDownTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert("Nome e Telefone são obrigatórios.");
      return;
    }

    addLead({
      name: formData.name,
      cpfCnpj: formData.cpfCnpj,
      email: formData.email,
      phone: formData.phone,
      pipelineStage: formData.pipelineStage,
      tags: tags
    });

    // Reset Form
    setFormData({
      name: '',
      cpfCnpj: '',
      email: '',
      phone: '',
      pipelineStage: pipelineStages[0]?.id || 'new'
    });
    setTags([]);
    closeModal();
  };

  return (
    <div className={styles.modalOverlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Adicionar Novo Lead</h2>
          <button className={styles.closeButton} onClick={closeModal}>
            <X size={20} />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Nome Completo *</label>
            <input 
              type="text" 
              name="name"
              className={styles.input} 
              placeholder="Digite o nome do lead"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className={styles.formGroup}>
              <label>CPF/CNPJ</label>
              <input 
                type="text" 
                name="cpfCnpj"
                className={styles.input} 
                placeholder="000.000.000-00"
                value={formData.cpfCnpj}
                onChange={handleInputChange}
              />
            </div>
            
            <div className={styles.formGroup}>
              <label>Telefone Completo *</label>
              <input 
                type="text" 
                name="phone"
                className={styles.input} 
                placeholder="(00) 00000-0000"
                value={formData.phone}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Email</label>
            <input 
              type="email" 
              name="email"
              className={styles.input} 
              placeholder="exemplo@email.com"
              value={formData.email}
              onChange={handleInputChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Área de Tags</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                className={styles.input} 
                placeholder="Digite a tag e aperte Enter"
                value={currentTag}
                onChange={(e) => setCurrentTag(e.target.value)}
                onKeyDown={handleKeyDownTag}
                style={{ flex: 1 }}
              />
              <button 
                type="button" 
                className={styles.cancelBtn} 
                onClick={handleAddTag}
              >
                Adicionar
              </button>
            </div>
            <div className={styles.tagArea}>
              {tags.map(tag => (
                <span key={tag} className={styles.tag}>
                  {tag}
                  <X size={12} className={styles.tagRemove} onClick={() => removeTag(tag)} />
                </span>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Posição no Pipeline</label>
            <select 
              name="pipelineStage"
              className={styles.select}
              value={formData.pipelineStage}
              onChange={handleInputChange}
            >
              {pipelineStages.map(stage => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancelar</button>
            <button type="submit" className={styles.submitBtn}>
              <Plus size={18} /> Cadastrar Lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewLeadModal;
