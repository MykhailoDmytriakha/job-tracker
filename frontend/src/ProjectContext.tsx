import { createContext, useContext, useState, useEffect } from "react";
import { projectsApi } from "./api";
import type { Project } from "./api";

interface ProjectCtx {
  projects: Project[];
  active: Project | null;
  setActiveId: (id: number) => void;
  reload: () => void;
}

const Ctx = createContext<ProjectCtx>({
  projects: [],
  active: null,
  setActiveId: () => {},
  reload: () => {},
});

export function useProject() {
  return useContext(Ctx);
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveIdRaw] = useState<number | null>(() => {
    const saved = localStorage.getItem("activeProjectId");
    return saved ? Number(saved) : null;
  });

  function setActiveId(id: number) {
    setActiveIdRaw(id);
    localStorage.setItem("activeProjectId", String(id));
  }

  function reload() {
    projectsApi.list().then((list) => {
      setProjects(list);
      if (list.length > 0 && (activeId === null || !list.find(p => p.id === activeId))) {
        setActiveId(list[0].id);
      }
    });
  }

  useEffect(() => { reload(); }, []);

  const active = projects.find((p) => p.id === activeId) || null;

  return (
    <Ctx.Provider value={{ projects, active, setActiveId, reload }}>
      {children}
    </Ctx.Provider>
  );
}
