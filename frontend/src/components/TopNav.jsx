import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

function getRole() {
  try {
    const token = localStorage.getItem('politor_token');
    if (!token) return null;
    return JSON.parse(atob(token)).role || null;
  } catch {
    return null;
  }
}

export default function TopNav() {
  const navigate = useNavigate();
  const isAdmin = getRole() === 'Admin';

  function handleLogout() {
    localStorage.removeItem('politor_token');
    navigate('/login');
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xl font-semibold text-gray-900 tracking-tight">Politor</span>
        <span className="text-xs text-gray-400 mt-0.5">AI Parliamentary Monitor</span>
      </div>

      <nav className="flex items-center gap-6">
        {isAdmin && (
          <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Dashboard
          </Link>
        )}
        <Link to="/chat" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
          Chat
        </Link>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          Logout
        </button>
      </nav>
    </header>
  );
}
