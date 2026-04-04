import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Pipeline } from "./pages/Pipeline";
import { Tasks } from "./pages/Tasks";
import { Settings } from "./pages/Settings";
import { MeetingCockpit } from "./pages/MeetingCockpit";
import { Docs } from "./pages/Docs";
import { Contacts } from "./pages/Contacts";
import { Companies } from "./pages/Companies";
import { Login } from "./pages/Login";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { Toast } from "./components/Toast";
import { ProjectProvider, useProject } from "./ProjectContext";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { Welcome } from "./components/Welcome";
import { AuthProvider, useAuth } from "./AuthContext";
import "./App.css";

function AppInner() {
  const { projects, loading } = useProject();

  if (loading) {
    return (
      <div className="login">
        <div className="login-spinner">
          <div className="login-spinner-ring" />
        </div>
      </div>
    );
  }

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
          <Route path="/tasks/:taskId" element={<Tasks />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:docId" element={<Docs />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/companies/:companyId" element={<Companies />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:contactId" element={<Contacts />} />
          <Route path="/tasks/:taskId/meeting/:meetingId/cockpit" element={<MeetingCockpit />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <Toast />
    </>
  );
}

function AuthGate() {
  const { user, loading, authRequired } = useAuth();

  if (loading) {
    return (
      <div className="login">
        <div className="login-spinner">
          <div className="login-spinner-ring" />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? <Navigate to="/" replace /> : <Login />
        }
      />
      <Route
        path="/*"
        element={
          !authRequired || user ? (
            <ProjectProvider>
              <AppInner />
            </ProjectProvider>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
