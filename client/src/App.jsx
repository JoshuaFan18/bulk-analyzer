import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './state.jsx';
import CollectionPage from './pages/CollectionPage.jsx';
import SurplusPage from './pages/SurplusPage.jsx';
import BulkAnalyzerPage from './pages/BulkAnalyzerPage.jsx';
import StaplesAnalyzerPage from './pages/StaplesAnalyzerPage.jsx';
import DeckBuilderPage from './pages/DeckBuilderPage.jsx';
import DecksPage from './pages/DecksPage.jsx';
import DeckViewerPage from './pages/DeckViewerPage.jsx';
import ConfigPage from './pages/ConfigPage.jsx';

export default function App() {
  const { loading, error, saving, dismissError } = useApp();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">RB</span>
            <span className="brand-name">Riftbound Manager</span>
          </div>
          <nav className="nav">
            <NavLink to="/collection">Collection</NavLink>
            <NavLink to="/surplus">Surplus</NavLink>
            <NavLink to="/bulk-analyzer">True Bulk Analyzer</NavLink>
            <NavLink to="/staples">Staples Analyzer</NavLink>
            <NavLink to="/deckbuilder">Deck Builder</NavLink>
            <NavLink to="/decks">My Decks</NavLink>
            <NavLink to="/config">Config</NavLink>
          </nav>
          <div className="topbar-status">{saving ? 'Saving…' : ''}</div>
        </div>
      </header>

      {error && (
        <div className="error-banner" onClick={dismissError}>
          {error} <span className="error-dismiss">(dismiss)</span>
        </div>
      )}

      <main className="main">
        {loading ? (
          <div className="page-loading">Loading card database…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/collection" replace />} />
            <Route path="/collection" element={<CollectionPage />} />
            <Route path="/surplus" element={<SurplusPage />} />
            <Route path="/bulk-analyzer" element={<BulkAnalyzerPage />} />
            <Route path="/staples" element={<StaplesAnalyzerPage />} />
            <Route path="/deckbuilder" element={<DeckBuilderPage />} />
            <Route path="/deckbuilder/:id" element={<DeckBuilderPage />} />
            <Route path="/decks" element={<DecksPage />} />
            <Route path="/decks/view/:id" element={<DeckViewerPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
