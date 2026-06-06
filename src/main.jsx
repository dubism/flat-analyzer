import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import FlatNotesApp from './FlatNotesAppV2';
import './index.css';

function Root() {
  const [hash, setHash] = useState(() => window.location.hash || '');

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash || '');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (hash.startsWith('#/notes')) return <FlatNotesApp />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
