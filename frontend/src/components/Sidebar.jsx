import React from 'react';
import { Link, useLocation } from 'react-router-dom';

function getRole() {
  try {
    const token = localStorage.getItem('politor_token');
    if (!token) return null;
    return JSON.parse(atob(token)).role || null;
  } catch {
    return null;
  }
}

export default function Sidebar() {
  const location = useLocation();
  const isAdmin = getRole() === 'Admin';

  const navItems = [
    ...(isAdmin ? [{ label: 'Dashboard', path: '/' }] : []),
    { label: 'Chat', path: '/chat' },
  ];

  return (
    <aside className="w-56 bg-gray-50 border-r border-gray-200 flex flex-col py-6 px-4 gap-1">
      {navItems.map((item) => {
        const active = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              active
                ? 'bg-gray-200 text-gray-900'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
