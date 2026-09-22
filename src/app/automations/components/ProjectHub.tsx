import { ArrowRight, Clock, LayoutGrid, Plus as PlusIcon, Share2, Zap } from "lucide-react";
import styles from "../automations.module.css";
import type { AutomationProject } from "../types";

interface ProjectHubProps {
  projects: AutomationProject[];
  onOpenProject: (projectId: string) => void;
  onNewProject: () => void;
}

export default function ProjectHub({ projects, onOpenProject, onNewProject }: ProjectHubProps) {
  return (
    <div className={styles.orchestratorContainer}>
      <nav className={styles.orchestratorHeader}>
        <div className={styles.headerLeft}>
          <div className={`${styles.flowIdentity} ${styles.hubIdentity}`}>
            <span>WORKSPACE DE AUTOMAÇÕES</span>
            <h1 className={styles.hubTitle}>Automações</h1>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button type="button" className={styles.actionBtnPrimary} onClick={onNewProject}><PlusIcon size={15} /> Novo projeto</button>
        </div>
      </nav>

      <main className={styles.projectHub}>
        <div className={styles.projectHubIntro}>
          <div>
            <span className={styles.inspectorEyebrow}>CENTRAL DE PROJETOS</span>
            <h2>Escolha um projeto para começar</h2>
            <p>Crie, organize e abra seus fluxos de automação em um só lugar. As ferramentas de edição aparecem somente quando um projeto é aberto.</p>
          </div>
          <div className={styles.projectHubCount}>{projects.length} {projects.length === 1 ? "projeto salvo" : "projetos salvos"}</div>
        </div>

        {projects.length > 0 ? (
          <section className={styles.projectCards} aria-label="Projetos de automação">
            {projects.map(project => {
              const projectStatus = project.status === "active" ? "Ativo" : project.status === "paused" ? "Pausado" : "Rascunho";
              return (
                <button type="button" className={styles.projectCard} key={project.id} onClick={() => onOpenProject(project.id)}>
                  <div className={styles.projectCardHead}>
                    <div className={`${styles.projectStatus} ${project.status === "active" ? styles.projectStatusActive : project.status === "paused" ? styles.projectStatusPaused : styles.projectStatusDraft}`}><span /> {projectStatus}</div>
                    <ArrowRight size={16} />
                  </div>
                  <h3>{project.name}</h3>
                  <p>{project.description}</p>
                  <div className={styles.projectCardMeta}><span><LayoutGrid size={13} /> {project.nodes.length} blocos</span><span><Share2 size={13} /> {project.connections.length} conexões</span><span><Clock size={13} /> {project.channels.length} canais</span></div>
                </button>
              );
            })}
          </section>
        ) : (
          <section className={styles.projectEmpty}>
            <div className={styles.projectEmptyIcon}><Zap size={22} /></div>
            <h3>Nenhum projeto criado</h3>
            <p>Comece criando seu primeiro projeto. Depois, você poderá escolher os canais, montar o fluxo e testar as conexões.</p>
            <button type="button" className={styles.modalConfirmBtn} onClick={onNewProject}><PlusIcon size={15} /> Criar primeiro projeto</button>
          </section>
        )}
      </main>
    </div>
  );
}
