import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import logoSvg from '../../assets/Logo SVG 1.svg';

function getUser() {
  try {
    const token = localStorage.getItem('politor_token');
    if (!token) return null;
    return JSON.parse(atob(token));
  } catch {
    return null;
  }
}

function getInitials(name, email) {
  if (name) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return email?.[0]?.toUpperCase() || '?';
}

export default function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const isAdmin = user?.role === 'Admin';
  const initials = getInitials(user?.name, user?.email);

  function handleLogout() {
    localStorage.removeItem('politor_token');
    navigate('/login');
  }

  return (
    <div className="bg-brand-light-blue px-4 pt-4 pb-2">
      <header className="bg-brand-dark-blue rounded-full px-6 flex items-stretch justify-between" style={{minHeight:'44px'}}>

        {/* Logo */}
        <img src={logoSvg} alt="Politor AI" className="h-8 select-none self-center" />

        {/* Nav links + avatar */}
        <nav className="flex items-stretch gap-6">
          <Link
            to="/chat"
            className={`text-sm transition-colors flex items-center ${
              location.pathname === '/chat'
                ? 'text-white border-b-2 border-white'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Workspace
          </Link>

          {isAdmin && (
            <Link
              to="/"
              className={`text-sm transition-colors flex items-center ${
                location.pathname === '/'
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Users
            </Link>
          )}

          <div className="flex items-center">
            <button
              onClick={handleLogout}
              title="Logout"
              className="w-8 h-8 rounded-full bg-brand-purple/80 flex items-center justify-center text-white text-xs font-semibold hover:bg-brand-purple transition-colors ring-2 ring-brand-purple/60 ring-offset-2 ring-offset-brand-dark-blue shadow-[0_0_10px_rgba(206,147,219,0.55)]"
            >
              {initials}
            </button>
          </div>
        </nav>

      </header>
    </div>
  );
}
