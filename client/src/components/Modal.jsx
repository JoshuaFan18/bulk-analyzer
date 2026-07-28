import React from 'react';

export default function Modal({ title, onClose, className, children }) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={className ? `modal ${className}` : 'modal'}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
