import React from 'react';

interface NotFoundProps {
  path: string;
  navigate: (path: string) => void;
}

export default function NotFound({ path, navigate }: NotFoundProps) {
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="typography-headline" style={{ marginBottom: 16 }}>404</div>
        <p className="typography-title" style={{ marginBottom: 8 }}>Page not found</p>
        <p className="typography-caption" style={{ marginBottom: 24 }}>
          <span className="typography-mono">{path}</span> does not exist
        </p>
        <button onClick={() => navigate('/overview')} className="btn btn--primary">
          Go to Overview
        </button>
      </div>
    </div>
  );
}
