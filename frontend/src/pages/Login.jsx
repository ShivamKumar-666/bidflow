import React, { useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import './Login.css';

const Login = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, register } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegistering) {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(isRegistering ? 'Registration failed. Email may already exist.' : 'Invalid email or password');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass-panel">
        <div className="login-header">
          <h1>BidFlow</h1>
          <p>{isRegistering ? 'Create a new account' : 'Login to your account'}</p>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit} className="login-form">
          {isRegistering && (
            <div className="input-group">
              <label>Full Name</label>
              <input 
                type="text" 
                className="input-field" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={isRegistering} 
              />
            </div>
          )}
          <div className="input-group">
            <label>Email Address</label>
            <input 
              type="email" 
              className="input-field" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input 
              type="password" 
              className="input-field" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          <button type="submit" className="btn-primary" style={{ marginTop: '16px' }}>
            {isRegistering ? 'Register' : 'Sign In'}
          </button>
        </form>
        
        <div style={{ marginTop: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {isRegistering ? 'Already have an account? ' : 'Don\'t have an account? '}
          <button 
            type="button" 
            onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isRegistering ? 'Sign In' : 'Register Here'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
