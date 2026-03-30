import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Pipeline } from "./pages/Pipeline";
import { Tasks } from "./pages/Tasks";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <nav className="nav">
        <NavLink to="/pipeline">Pipeline</NavLink>
        <NavLink to="/tasks">Tasks</NavLink>
        <div className="nav-spacer" />
        <ThemeSwitcher />
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Pipeline />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/tasks" element={<Tasks />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
