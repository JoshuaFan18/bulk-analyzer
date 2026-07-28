import React, { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { parseImport } from '../lib/importExport.js';
import { useApp } from '../state.jsx';

export default function ImportDialog({ onClose }) {
  const { cards, mergeCollection, replaceCollection } = useApp();
  const [text, setText] = useState('');
  const [mode, setMode] = useState('add');

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return parseImport(text, cards);
    } catch (e) {
      return { error: e.message };
    }
  }, [text, cards]);

  const totals = useMemo(() => {
    if (!preview?.entries) return null;
    let normal = 0;
    let foil = 0;
    for (const e of Object.values(preview.entries)) {
      normal += e.normal;
      foil += e.foil;
    }
    return { normal, foil };
  }, [preview]);

  const convertedCopies = useMemo(
    () => (preview?.converted || []).reduce((sum, c) => sum + c.qty, 0),
    [preview],
  );

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  };

  const apply = () => {
    if (!preview?.entries) return;
    if (mode === 'replace') replaceCollection(preview.entries);
    else mergeCollection(preview.entries);
    onClose();
  };

  return (
    <Modal title="Import cards" onClose={onClose}>
      <p className="muted">
        Paste or upload a CSV. Supported formats: DotGG (
        <code>CardId,Normal,Foil,Name,Set</code>), Legacy (<code>Normal,Foil,CardId</code>), and
        TCGplayer collection exports.
      </p>
      <input type="file" accept=".csv,.txt" onChange={onFile} style={{ marginBottom: 8 }} />
      <textarea
        placeholder="Paste CSV content here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {preview?.error && (
        <div className="import-preview">
          <span className="warn">{preview.error}</span>
        </div>
      )}
      {preview?.entries && (
        <div className="import-preview">
          <div>
            Detected format: <strong>{preview.format}</strong>
          </div>
          <div>
            Matched <strong>{preview.matched}</strong> rows → {Object.keys(preview.entries).length}{' '}
            unique cards ({totals.normal} normal + {totals.foil} foil copies)
          </div>
          {preview.converted.length > 0 && (
            <>
              <div>
                {convertedCopies} {convertedCopies === 1 ? 'copy' : 'copies'} moved to the only
                finish their printing has:
              </div>
              <div className="unmatched-list">
                {preview.converted.map((c) => (
                  <div key={`${c.id}|${c.from}`}>
                    {c.id} {c.name} — {c.qty} {c.from} → {c.to}
                  </div>
                ))}
              </div>
            </>
          )}
          {preview.unmatched.length > 0 && (
            <>
              <div className="warn">{preview.unmatched.length} rows could not be matched:</div>
              <div className="unmatched-list">
                {preview.unmatched.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="modal-actions">
        <label className="inline" style={{ marginRight: 'auto', display: 'flex', gap: 6 }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="add">Add to collection</option>
            <option value="replace">Replace collection</option>
          </select>
        </label>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!preview?.entries} onClick={apply}>
          Import
        </button>
      </div>
    </Modal>
  );
}
