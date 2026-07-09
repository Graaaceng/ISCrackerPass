import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/theme.css';
import './styles/base.css';
import './styles/app.css';

import Layout from './components/Layout.jsx';
import NotFound from './pages/NotFound.jsx';
import PasswordStrength from './pages/PasswordStrength.jsx'
import VoiceClone from './pages/VoiceClone.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<PasswordStrength />} />
          <Route path="voice-clone" element={<VoiceClone />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
