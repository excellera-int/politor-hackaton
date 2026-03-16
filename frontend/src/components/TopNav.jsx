import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

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
      <header className="bg-brand-dark-blue rounded-full px-6 py-2.5 flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-1 select-none">
          <span className="text-white font-semibold text-base tracking-tight">Politor</span>
          <span className="font-semibold text-base bg-gradient-to-r from-brand-purple to-brand-energic-blue bg-clip-text text-transparent">
            AI
          </span>
        </div>

        {/* Nav links + avatar */}
        <nav className="flex items-center gap-6">
          <Link
            to="/chat"
            className={`text-sm transition-colors ${
              location.pathname === '/chat'
                ? 'text-white underline underline-offset-4'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Workspace
          </Link>

          {isAdmin && (
            <Link
              to="/"
              className={`text-sm transition-colors ${
                location.pathname === '/'
                  ? 'text-white underline underline-offset-4'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Users
            </Link>
          )}

          <button
            onClick={handleLogout}
            title="Logout"
            className="w-8 h-8 rounded-full bg-brand-purple/80 flex items-center justify-center text-white text-xs font-semibold hover:bg-brand-purple transition-colors"
          >
            {initials}
          </button>
        </nav>

      </header>
    </div>
  );
}
