import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './theme/styles.css';
import './theme/site.css';
import './theme/portal.css';

import { AuthProvider } from './auth/AuthContext.jsx';
import { RequireAuth, RequireAdmin } from './components/guards.jsx';
import Layout from './components/Layout.jsx';

import Login from './routes/Login.jsx';
import Authorize from './routes/Authorize.jsx';
import Register from './routes/Register.jsx';
import VerifyEmail from './routes/VerifyEmail.jsx';
import ForgotPassword from './routes/ForgotPassword.jsx';
import ResetPassword from './routes/ResetPassword.jsx';
import ChangePassword from './routes/ChangePassword.jsx';
import Dashboard from './routes/Dashboard.jsx';
import Tokens from './routes/Tokens.jsx';
import Profile from './routes/Profile.jsx';
import MyAccess from './routes/MyAccess.jsx';
import AdminUsers from './routes/admin/Users.jsx';
import AdminSkills from './routes/admin/Skills.jsx';
import UserAccess from './routes/admin/UserAccess.jsx';
import AdminClients from './routes/admin/Clients.jsx';
import ClientDetail from './routes/admin/ClientDetail.jsx';

const withLayout = (el) => <Layout>{el}</Layout>;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/access">
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/authorize" element={<Authorize />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Authenticated */}
          <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
          <Route path="/" element={<RequireAuth>{withLayout(<Dashboard />)}</RequireAuth>} />
          <Route path="/tokens" element={<RequireAuth>{withLayout(<Tokens />)}</RequireAuth>} />
          <Route path="/profile" element={<RequireAuth>{withLayout(<Profile />)}</RequireAuth>} />
          <Route path="/my-access" element={<RequireAuth>{withLayout(<MyAccess />)}</RequireAuth>} />

          {/* Admin */}
          <Route path="/admin/users" element={<RequireAdmin>{withLayout(<AdminUsers />)}</RequireAdmin>} />
          <Route path="/admin/users/:id" element={<RequireAdmin>{withLayout(<UserAccess />)}</RequireAdmin>} />
          <Route path="/admin/skills" element={<RequireAdmin>{withLayout(<AdminSkills />)}</RequireAdmin>} />
          <Route path="/admin/clients" element={<RequireAdmin>{withLayout(<AdminClients />)}</RequireAdmin>} />
          <Route path="/admin/clients/:id" element={<RequireAdmin>{withLayout(<ClientDetail />)}</RequireAdmin>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
