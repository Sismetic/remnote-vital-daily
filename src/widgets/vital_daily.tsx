import { AppEvents, Queue, type ReactRNPlugin, useAPIEventListener, usePlugin } from '@remnote/plugin-sdk';
import React, { useEffect, useRef, useState } from 'react';
import { DAILY_LIMIT, localDay } from '../daily_plan';
import { buildDailyPlan, recordProgress, type DailyPlan, type DailyPriority } from '../vital_data';

const DISPLAY = {
  vital: { label: 'Vital', plural: 'vitales', icon: '🔥', popup: 'vital_daily_popup' },
  important: { label: 'Importante', plural: 'importantes', icon: '⭐', popup: 'important_daily_popup' },
} as const;

export async function openDailyStudy(plugin: ReactRNPlugin, priority: DailyPriority): Promise<void> {
  await plugin.widget.openPopup(DISPLAY[priority].popup);
}
export function DailyPracticeWidget({ priority, startStudying = true, launchInStudyPane = false }: {
  priority: DailyPriority; startStudying?: boolean; launchInStudyPane?: boolean;
}) {
  const plugin = usePlugin() as ReactRNPlugin;
  const display = DISPLAY[priority];
  const [plan, setPlan] = useState<DailyPlan>();
  const [error, setError] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [studying, setStudying] = useState(startStudying);
  const [progress, setProgress] = useState(0);
  const polling = useRef(false);
  const scrollRoot = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    setError(undefined); setPlan(undefined);
    buildDailyPlan(plugin, priority).then((result) => {
      if (active) { setPlan(result); setProgress(result.practicedCount); }
    }).catch((reason) => {
      console.error(`[${display.label}] Daily plan failed`, reason);
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { active = false; };
  }, [plugin, priority, refresh]);
  const observeProgress = async () => {
    if (!plan || polling.current) return;
    if (localDay(Date.now()) !== plan.state.day) { setRefresh((value) => value + 1); return; }
    polling.current = true;
    try {
      const count = await recordProgress(plugin, plan.trackedIds, plan.state.day, plan.storageKey);
      if (count !== undefined) setProgress(count);
    } catch (reason) { console.error(`[${display.label}] Could not refresh progress`, reason); }
    finally { polling.current = false; }
  };
  useAPIEventListener(AppEvents.QueueCompleteCard, undefined, () => {
    if (scrollRoot.current) scrollRoot.current.scrollTop = 0;
    void observeProgress();
  });
  useEffect(() => {
    if (!plan) return;
    const timer = setInterval(() => { void observeProgress(); }, 5000);
    return () => clearInterval(timer);
  }, [plan]);
  const close = async () => { await observeProgress(); await plugin.widget.closePopup(); };
  return (
    <main className="vital-scroll" ref={scrollRoot} style={styles.root}>
      <style>{`
        html, body { margin: 0; height: 100%; overflow: hidden; }
        body { font-family: system-ui, sans-serif; }
        .vital-scroll { scrollbar-gutter: stable; }
        @supports (height: 100dvh) { .vital-scroll { height: 100dvh !important; } }
        .vital-scroll { -webkit-overflow-scrolling: touch; }
        .vital-scroll button { min-height: 44px; touch-action: manipulation; }
        .vital-body { padding-bottom: max(160px, env(safe-area-inset-bottom)) !important; }
        @media (max-width: 600px) {
          .vital-header { padding: 12px !important; }
          .vital-header h1 { font-size: 18px !important; }
          .vital-header-actions { width: 100%; }
          .vital-header-actions button { flex: 1; }
          .vital-body { padding-left: 10px !important; padding-right: 10px !important; }
          .vital-body li { overflow-wrap: anywhere; }
        }
        button:focus-visible { outline: 3px solid #8498ff; outline-offset: 2px; }
      `}</style>
      <header className="vital-header" style={styles.header}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 21 }}>{display.icon} {display.label} · Práctica de hoy</h1>
          <p style={styles.caption}>{plan ? `${progress}/${DAILY_LIMIT} distintas estudiadas hoy · ${plan.cardIds.length} en esta sesión · ${plan.books.length} libros` : 'Preparando una mezcla de tus libros…'}</p>
        </div>
        <div className="vital-header-actions" style={{ display: 'flex', gap: 8 }}>
          {plan && <button style={styles.button} onClick={() => setStudying((value) => !value)}>{studying ? 'Ver plan' : 'Continuar'}</button>}
          <button style={styles.button} onClick={() => { void close(); }}>Cerrar</button>
        </div>
      </header>
      <div className="vital-body" style={styles.scroll}>
        {error ? <section style={styles.summary}>
          <h2>No pude preparar la sesión</h2><p role="alert">{error}</p>
          <button style={styles.primary} onClick={() => setRefresh((value) => value + 1)}>Reintentar</button>
        </section> : !plan ? <section style={styles.summary}>
          <h2>Cargando tus tarjetas {display.plural}…</h2><p>Buscando los repasos y repartiendo las nuevas entre libros.</p>
        </section> : studying && plan.cardIds.length ? (
          // Auto height lets long native answers expand the virtual embed; the
          // SDK forwards wheel events to our scrollable parent inside the iframe.
          <Queue cardIds={plan.cardIds} width="100%" height="auto" />
        ) : <section style={styles.summary}>
          <h2>{plan.cardIds.length ? 'Tu plan de hoy' : progress >= DAILY_LIMIT ? 'Cupo de hoy completado' : `No hay tarjetas ${display.plural} pendientes ahora`}</h2>
          <p>{plan.cardIds.length ? `${plan.dueCount} repasos y ${plan.newCount} nuevas, repartidas entre ${plan.books.length} libros.` : 'La selección se actualizará al abrir la práctica. Los repasos siguen los intervalos de RemNote.'}</p>
          <p>{plan.totalCards} tarjetas {display.plural} disponibles en tu biblioteca.</p>
          <p>Hasta {DAILY_LIMIT} tarjetas distintas al día. Si olvidas una, puede repetirse. Reabrir conserva el progreso; no agrega otro lote.</p>
          {plan.cardIds.length > 0 && <button style={styles.primary} onClick={() => setStudying(true)}>Continuar práctica · {plan.cardIds.length}</button>}
          <ul>{plan.books.map((book) => <li key={book.id} style={{ margin: '10px 0' }}>{book.name} — {book.count}</li>)}</ul>
          <p style={styles.caption}>Los libros nuevos y las tarjetas con tag {priority} entran automáticamente en la selección. No hace falta elegir libros cada día.</p>
          <button style={styles.button} onClick={() => { if (launchInStudyPane) void openDailyStudy(plugin, priority); else setRefresh((value) => value + 1); }}>Actualizar selección</button>
        </section>}
      </div>
    </main>
  );
}
const styles: Record<string, React.CSSProperties> = {
  // Native virtual embeds aren't clipped to a nested iframe scroll region.
  // Scroll the header and queue together, so native content cannot cover the
  // header's buttons. Extra footer room also protects the native rating row.
  root: { height: '100vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box', background: 'var(--rn-clr-background-primary, #fff)', color: 'var(--rn-clr-content-primary, #242536)' },
  header: { flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(120,120,140,.22)' },
  caption: { margin: '6px 0 0', opacity: 0.72, fontSize: 13 },
  scroll: { padding: '12px 20px 160px', boxSizing: 'border-box' },
  summary: { maxWidth: 780, margin: '20px auto', lineHeight: 1.6 },
  button: { border: '1px solid rgba(120,120,140,.4)', borderRadius: 8, padding: '9px 13px', background: 'transparent', color: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  primary: { border: 0, borderRadius: 8, padding: '12px 20px', background: '#345cff', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 600 },
};
