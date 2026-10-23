import { renderWidget, usePlugin, type ReactRNPlugin } from '@remnote/plugin-sdk';
import React from 'react';
import { isMobileDevice } from '../mobile_layout';
import { openDailyStudy } from './vital_daily';

function MobileLauncher() {
  const plugin = usePlugin() as ReactRNPlugin;
  if (!isMobileDevice(window.screen.width, navigator.userAgent)) return null;

  return (
    <section style={styles.root} aria-label="Prácticas diarias por prioridad">
      <div style={styles.copy}>
        <strong>Prácticas diarias</strong>
        <span style={styles.caption}>Hasta 35 tarjetas distintas por prioridad.</span>
      </div>
      <div style={styles.actions}>
        <button style={styles.vital} onClick={() => { void openDailyStudy(plugin, 'vital'); }}>
          🔥 Practicar VITAL
        </button>
        <button style={styles.important} onClick={() => { void openDailyStudy(plugin, 'important'); }}>
          ⭐ Practicar IMPORTANTE
        </button>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    boxSizing: 'border-box',
    width: '100%',
    padding: 14,
    margin: '8px 0',
    border: '1px solid rgba(120,120,140,.28)',
    borderRadius: 12,
    background: 'var(--rn-clr-background-primary, #fff)',
    color: 'var(--rn-clr-content-primary, #242536)',
    fontFamily: 'system-ui, sans-serif',
  },
  copy: { display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 },
  caption: { fontSize: 13, opacity: 0.72 },
  actions: { display: 'grid', gridTemplateColumns: '1fr', gap: 9 },
  vital: {
    minHeight: 48, border: 0, borderRadius: 10, padding: '11px 14px',
    background: '#6f42c1', color: '#fff', fontSize: 15, fontWeight: 700,
  },
  important: {
    minHeight: 48, border: 0, borderRadius: 10, padding: '11px 14px',
    background: '#237a3b', color: '#fff', fontSize: 15, fontWeight: 700,
  },
};

renderWidget(MobileLauncher);
