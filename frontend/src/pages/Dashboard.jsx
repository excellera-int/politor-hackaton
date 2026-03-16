import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import TopNav from '../components/TopNav';

const USERS_QUERY = gql`
  query Users {
    users { id email name role }
  }
`;

const CREATE_USER = gql`
  mutation CreateUser($email: String!, $name: String!, $role: String!, $password: String!) {
    createUser(email: $email, name: $name, role: $role, password: $password) { id email name role }
  }
`;

const DELETE_USER = gql`
  mutation DeleteUser($id: ID!) { deleteUser(id: $id) }
`;

const UPDATE_PASSWORD = gql`
  mutation UpdateUserPassword($id: ID!, $newPassword: String!) {
    updateUserPassword(id: $id, newPassword: $newPassword)
  }
`;

const UPDATE_ROLE = gql`
  mutation UpdateUserRole($id: ID!, $role: String!) {
    updateUserRole(id: $id, role: $role) { id email name role }
  }
`;

const AVATAR_COLORS = [
  'bg-blue-400',
  'bg-violet-400',
  'bg-teal-400',
  'bg-emerald-400',
  'bg-rose-400',
  'bg-amber-400',
];

function getInitials(name, email) {
  if (name) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return email?.[0]?.toUpperCase() || '?';
}

function avatarColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function TypeBadge({ role }) {
  const isAdmin = role === 'Admin';
  return (
    <span className={`inline-block px-3 py-0.5 rounded-full text-xs font-medium ${
      isAdmin ? 'bg-brand-purple/20 text-purple-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {isAdmin ? 'Admin' : 'User'}
    </span>
  );
}

// ── Add New User Modal ─────────────────────────────────────────────────────────
function AddUserModal({ onClose, refetch }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [createUser, { loading, error }] = useMutation(CREATE_USER, {
    onCompleted: () => { refetch(); onClose(); },
  });
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[480px] p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Add New User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input type="text" placeholder="e.g. Jane Doe" value={form.name} onChange={set('name')}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
            <input type="email" placeholder="jane@company.com" value={form.email} onChange={set('email')}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} placeholder="Enter password" value={form.password} onChange={set('password')}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/40" />
              <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPwd
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">User Type</label>
            <div className="relative">
              <select value={form.role} onChange={set('role')}
                className="w-full appearance-none border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/40 bg-white">
                <option value="">Select User Type</option>
                <option value="Member">User</option>
                <option value="Admin">Admin</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error.message}</p>}

        <div className="flex justify-end mt-6">
          <button
            disabled={!form.email || !form.name || !form.password || !form.role || loading}
            onClick={() => createUser({ variables: { ...form } })}
            className="bg-brand-purple text-white rounded-full px-6 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Add User
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit User Modal ────────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, refetch }) {
  const [pwd, setPwd] = useState('');
  const [role, setRole] = useState(user.role);
  const [showPwd, setShowPwd] = useState(false);

  const [updatePassword, { loading: loadingPwd }] = useMutation(UPDATE_PASSWORD);
  const [updateRole, { loading: loadingRole }] = useMutation(UPDATE_ROLE);

  const loading = loadingPwd || loadingRole;

  async function handleUpdate() {
    const ops = [];
    if (pwd.trim()) ops.push(updatePassword({ variables: { id: user.id, newPassword: pwd } }));
    if (role !== user.role) ops.push(updateRole({ variables: { id: user.id, role } }));
    await Promise.all(ops);
    refetch();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[480px] p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-brand-purple/20 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Edit User</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input type="text" value={user.name || ''} readOnly
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
            <input type="email" value={user.email} readOnly
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} placeholder="New password (leave blank to keep)" value={pwd} onChange={(e) => setPwd(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/40" />
              <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPwd
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">User Type</label>
            <div className="relative">
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="w-full appearance-none border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/40 bg-white">
                <option value="Member">User</option>
                <option value="Admin">Admin</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            disabled={loading}
            onClick={handleUpdate}
            className="bg-brand-purple text-white rounded-full px-6 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? 'Saving…' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete User Modal ──────────────────────────────────────────────────────────
function DeleteUserModal({ user, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[400px] p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-brand-purple/15 flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete User</h2>
        <p className="text-sm text-gray-500 mb-6">
          Are you sure you want to delete this user? This action cannot be undone and will remove all associated data.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            No, Cancel
          </button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className="px-6 py-2 rounded-full bg-brand-purple text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? 'Deleting…' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const usersQuery = useQuery(USERS_QUERY);
  const [deleteUser, { loading: deleteLoading }] = useMutation(DELETE_USER, {
    onCompleted: () => { usersQuery.refetch(); setDeleteModal(null); },
  });

  const [editModal, setEditModal]     = useState(null);
  const [addModal, setAddModal]       = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);

  const users = usersQuery.data?.users || [];

  return (
    <div className="min-h-screen bg-brand-light-blue flex flex-col">
      <TopNav />

      <main className="flex-1 px-10 py-8 max-w-5xl w-full mx-auto">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark-blue font-funnel">Users</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage team members and their access levels</p>
          </div>
          <button
            onClick={() => setAddModal(true)}
            className="flex items-center gap-1.5 bg-brand-dark-blue text-white text-sm font-medium px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New User
          </button>
        </div>

        {/* Users table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {usersQuery.loading && <p className="text-sm text-gray-400 p-6">Loading…</p>}
          {usersQuery.error && <p className="text-sm text-red-500 p-6">{usersQuery.error.message}</p>}

          {!usersQuery.loading && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-4 w-24">Actions</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-4">Name</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-4">Email</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-4">Type</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const initials = getInitials(u.name, u.email);
                  const color = avatarColor(u.email);
                  return (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditModal(u)}
                            className="text-gray-400 hover:text-brand-energic-blue transition-colors"
                            title="Edit user"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button
                            onClick={() => setDeleteModal(u)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete user"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </td>
                      {/* Name + avatar */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>
                            {initials}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{u.name || '—'}</span>
                        </div>
                      </td>
                      {/* Email */}
                      <td className="px-4 py-4 text-sm text-gray-500">{u.email}</td>
                      {/* Type badge */}
                      <td className="px-6 py-4">
                        <TypeBadge role={u.role} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Table footer */}
          {!usersQuery.loading && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                Showing {users.length} user{users.length !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-1">
                <button className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Page footer */}
      <footer className="text-center text-xs text-gray-400 py-6">
        © 2026 Politor AI. All rights reserved.
      </footer>

      {/* Modals */}
      {addModal && (
        <AddUserModal onClose={() => setAddModal(false)} refetch={usersQuery.refetch} />
      )}
      {editModal && (
        <EditUserModal user={editModal} onClose={() => setEditModal(null)} refetch={usersQuery.refetch} />
      )}
      {deleteModal && (
        <DeleteUserModal
          user={deleteModal}
          loading={deleteLoading}
          onClose={() => setDeleteModal(null)}
          onConfirm={() => deleteUser({ variables: { id: deleteModal.id } })}
        />
      )}
    </div>
  );
}
