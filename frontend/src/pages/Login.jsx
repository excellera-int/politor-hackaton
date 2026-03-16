import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, gql } from '@apollo/client';
import logo from '../../assets/Logo SVG 1.svg';

const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password)
  }
`;

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const [login, { loading }] = useMutation(LOGIN_MUTATION, {
    onCompleted: (data) => {
      if (data.login) {
        localStorage.setItem('politor_token', data.login);
        try {
          const { role } = JSON.parse(atob(data.login));
          navigate(role === 'Admin' ? '/' : '/chat');
        } catch {
          navigate('/chat');
        }
      } else {
        setError('Login failed. Check your credentials.');
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    login({ variables: { email, password } });
  }

  return (
    <div className="min-h-screen bg-brand-light-blue flex flex-col items-center justify-center gap-6 px-4">

      <img src={logo} alt="Politor AI" className="h-16" />

      <div className="bg-white rounded-2xl shadow-md p-10 w-full max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 font-funnel">Email</label>
            <input
              type="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-brand-white-gray border border-gray-200 rounded-full px-5 py-3 text-sm font-funnel focus:outline-none focus:ring-2 focus:ring-brand-energic-blue"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 font-funnel">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-brand-white-gray border border-gray-200 rounded-full px-5 py-3 pr-12 text-sm font-funnel focus:outline-none focus:ring-2 focus:ring-brand-energic-blue"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-dark-blue text-white rounded-full py-3 text-sm font-medium font-funnel hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Signing in…' : <>Enter <span>→</span></>}
          </button>

        </form>
      </div>

      <div className="flex gap-6 text-xs text-gray-400">
        <a href="#" className="hover:text-gray-600">Privacy Policy</a>
        <a href="#" className="hover:text-gray-600">Terms of Service</a>
        <a href="#" className="hover:text-gray-600">Help Center</a>
      </div>

    </div>
  );
}
