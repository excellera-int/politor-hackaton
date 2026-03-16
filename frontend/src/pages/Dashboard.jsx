import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import TopNav from '../components/TopNav';
import Sidebar from '../components/Sidebar';

const SYSTEM_HEALTH_QUERY = gql`
  query SystemHealth {
    systemHealth { postgres neo4j timestamp }
  }
`;

const SESSIONS_QUERY = gql`
  query RecentSessions {
    sessions(limit: 10) { id number branch type status date }
  }
`;

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

function StatusBadge({ value }) {
  const ok = value === 'ok';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Connected' : 'Error'}
    </span>
  );
}

function ChangePasswordModal({ user, onClose }) {
  const [pwd, setPwd] = useState('');
  const [updatePassword, { loading }] = useMutation(UPDATE_PASSWORD, {
    onCompleted: onClose,
  });

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg border border-gray-200 p-6 w-80 shadow-lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Change password</h3>
        <p className="text-xs text-gray-500 mb-4">{user.email}</p>
        <input
          type="password"
          placeholder="New password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-1.5 rounded hover:bg-gray-100">Cancel</button>
          <button
            disabled={!pwd.trim() || loading}
            onClick={() => updatePassword({ variables: { id: user.id, newPassword: pwd } })}
            className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AddUserModal({ onClose, refetch }) {
  const [form, setForm] = useState({ email: '', name: '', role: 'Member', password: '' });
  const [createUser, { loading, error }] = useMutation(CREATE_USER, {
    onCompleted: () => { refetch(); onClose(); },
  });

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg border border-gray-200 p-6 w-80 shadow-lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Add user</h3>
        <div className="flex flex-col gap-3">
          <input type="text" placeholder="Full name" value={form.name} onChange={set('name')}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
          <input type="email" placeholder="Email" value={form.email} onChange={set('email')}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
          <input type="password" placeholder="Password" value={form.password} onChange={set('password')}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
          <select value={form.role} onChange={set('role')}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400">
            <option value="Member">Analyst (Member)</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error.message}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-1.5 rounded hover:bg-gray-100">Cancel</button>
          <button
            disabled={!form.email || !form.name || !form.password || loading}
            onClick={() => createUser({ variables: form })}
            className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const healthQuery  = useQuery(SYSTEM_HEALTH_QUERY);
  const sessionsQuery = useQuery(SESSIONS_QUERY);
  const usersQuery   = useQuery(USERS_QUERY);

  const [deleteUser]  = useMutation(DELETE_USER, { onCompleted: () => usersQuery.refetch() });
  const [updateRole]  = useMutation(UPDATE_ROLE,  { onCompleted: () => usersQuery.refetch() });

  const [pwdModal, setPwdModal]   = useState(null); // user object
  const [addModal, setAddModal]   = useState(false);

  const health   = healthQuery.data?.systemHealth;
  const sessions = sessionsQuery.data?.sessions || [];
  const users    = usersQuery.data?.users || [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopNav />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-8 max-w-5xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Dashboard</h2>

          {/* System health */}
          <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">System Health</h3>
            {healthQuery.loading && <p className="text-sm text-gray-400">Checking…</p>}
            {healthQuery.error && <p className="text-sm text-red-600">Could not reach backend: {healthQuery.error.message}</p>}
            {health && (
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">PostgreSQL</span>
                  <StatusBadge value={health.postgres} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Neo4j</span>
                  <StatusBadge value={health.neo4j} />
                </div>
                <span className="text-xs text-gray-400 ml-auto self-center">
                  {new Date(health.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}
          </section>

          {/* User management */}
          <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">User Management</h3>
              <button
                onClick={() => setAddModal(true)}
                className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 transition-colors"
              >
                + Add user
              </button>
            </div>
            {usersQuery.loading && <p className="text-sm text-gray-400">Loading…</p>}
            {usersQuery.error && <p className="text-sm text-red-600">{usersQuery.error.message}</p>}
            {!usersQuery.loading && users.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="pb-2 pr-4">Name</th>
                      <th className="pb-2 pr-4">Email</th>
                      <th className="pb-2 pr-4">Role</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-4 font-medium text-gray-900">{u.name || '—'}</td>
                        <td className="py-2 pr-4 text-gray-600">{u.email}</td>
                        <td className="py-2 pr-4">
                          <select
                            value={u.role}
                            onChange={(e) => updateRole({ variables: { id: u.id, role: e.target.value } })}
                            className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400"
                          >
                            <option value="Member">Analyst</option>
                            <option value="Admin">Admin</option>
                          </select>
                        </td>
                        <td className="py-2 flex gap-2">
                          <button
                            onClick={() => setPwdModal(u)}
                            className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-1 transition-colors"
                          >
                            Change password
                          </button>
                          <button
                            onClick={() => { if (window.confirm(`Delete ${u.email}?`)) deleteUser({ variables: { id: u.id } }); }}
                            className="text-xs text-red-500 hover:text-red-700 border border-red-100 rounded px-2 py-1 transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Recent sessions */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Recent Sessions</h3>
            {sessionsQuery.loading && <p className="text-sm text-gray-400">Loading…</p>}
            {sessionsQuery.error && <p className="text-sm text-red-600">{sessionsQuery.error.message}</p>}
            {!sessionsQuery.loading && sessions.length === 0 && (
              <p className="text-sm text-gray-400">
                No sessions found. Run the data ingestion script to populate the database.
              </p>
            )}
            {sessions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="pb-2 pr-4">Number</th>
                      <th className="pb-2 pr-4">Branch</th>
                      <th className="pb-2 pr-4">Type</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-4 font-medium text-gray-900">{s.number || '—'}</td>
                        <td className="py-2 pr-4 text-gray-600">{s.branch || '—'}</td>
                        <td className="py-2 pr-4 text-gray-600">{s.type || '—'}</td>
                        <td className="py-2 pr-4 text-gray-600">{s.status || '—'}</td>
                        <td className="py-2 text-gray-500">
                          {s.date ? new Date(s.date).toLocaleDateString('en-GB') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>

      {pwdModal && <ChangePasswordModal user={pwdModal} onClose={() => setPwdModal(null)} />}
      {addModal && <AddUserModal onClose={() => setAddModal(false)} refetch={usersQuery.refetch} />}
    </div>
  );
}
