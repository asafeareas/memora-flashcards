import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, Archive, Flame, Home, Menu as MenuIcon, Settings, Sparkles, Trash2 } from "lucide-react";
import { Logo } from "../../ui/controls";
import { useActivity } from "../../hooks/useData";
import { BackupBanner } from "./BackupBanner";

const NAV = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/activity", label: "Atividade", icon: Activity },
  { to: "/ai", label: "Criar com IA", icon: Sparkles },
];
const MORE = [
  { to: "/archive", label: "Arquivo", icon: Archive },
  { to: "/trash", label: "Excluídos recentemente", icon: Trash2 },
  { to: "/settings", label: "Configurações", icon: Settings },
];

export function Layout() {
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const activity = useActivity();
  useEffect(() => {
    setDrawer(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <button className="icon-btn menu-toggle" aria-label="Abrir menu" onClick={() => setDrawer(true)}>
            <MenuIcon />
          </button>
          <Link to="/" className="brand" aria-label="Memora, início">
            <Logo />
            <span>Memora</span>
          </Link>
          <nav className="nav" aria-label="Principal">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar__right">
            <Link
              to="/activity"
              className={`streak-chip${activity?.todayActive ? "" : " inactive"}`}
              title={activity?.todayActive ? "Meta de hoje concluída" : "Estude 5 cartões para manter a sequência"}
            >
              <Flame size={18} />
              <span>{activity?.streak ?? 0}</span>
            </Link>
            <NavLink to="/settings" className="icon-btn hide-mobile" aria-label="Configurações">
              <Settings />
            </NavLink>
          </div>
        </div>
      </header>
      {drawer && (
        <div className="drawer" onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <nav className="drawer__panel" aria-label="Menu">
            <Link to="/" className="brand" style={{ padding: "4px 12px 14px" }}>
              <Logo />
              <span>Memora</span>
            </Link>
            {[...NAV, ...MORE].map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"}>
                <n.icon size={20} />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
      <main className="main">
        <BackupBanner />
        <Outlet />
      </main>
    </div>
  );
}
