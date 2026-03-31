import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Pipeline } from "./pages/Pipeline";
import { Tasks } from "./pages/Tasks";
import { Settings } from "./pages/Settings";
import { Docs } from "./pages/Docs";
import { Contacts } from "./pages/Contacts";
import { Companies } from "./pages/Companies";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { Toast } from "./components/Toast";
import { ProjectProvider, useProject } from "./ProjectContext";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { Welcome } from "./components/Welcome";
import "./App.css";

function AppInner() {
  const { projects } = useProject();

  // No projects: show welcome / onboarding
  if (projects.length === 0) {
    return (
      <>
        <Welcome />
        <Toast />
      </>
    );
  }

  return (
    <>
      <nav className="nav">
        <ProjectSwitcher />
        <NavLink to="/">Dashboard</NavLink>
        <NavLink to="/pipeline">Pipeline</NavLink>
        <NavLink to="/tasks">Tasks</NavLink>
        <NavLink to="/docs">Docs</NavLink>
        <NavLink to="/companies">Companies</NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <div className="nav-spacer" />
        <ThemeSwitcher />
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <Toast />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ProjectProvider>
        <AppInner />
      </ProjectProvider>
    </BrowserRouter>
  );
}

export default App;
