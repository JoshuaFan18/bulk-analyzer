import React from 'react';
import Modal from './Modal.jsx';
import { exportDeckText } from '../lib/deck.js';

// The plain-text deck export, opened from both the builder and the viewer. The
// text is rendered once and reused by the copy button, so what is copied is
// always exactly what is on screen.
export default function DeckExportModal({ deck, cardsById, onClose }) {
  const text = exportDeckText(deck, cardsById);
  return (
    <Modal title="Export deck" onClose={onClose}>
      <textarea readOnly value={text} onFocus={(e) => e.target.select()} />
      <div className="modal-actions">
        <button onClick={() => navigator.clipboard.writeText(text)}>Copy to clipboard</button>
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
