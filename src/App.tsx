import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, ArrowLeft, ArrowRight, CalendarClock, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, FileClock, FileText, Fingerprint, Gauge, LockKeyhole, Pause, Play, RotateCcw, Scale, Search, Settings2, Shield, ShieldCheck, SlidersHorizontal, Sparkles, X, AlertTriangle, BarChart3 } from 'lucide-react';
import { JusticeLogo } from './components/JusticeLogo';
import { addLocalBo, desktopAvailable, openOfficialPortal, runDesktopSyntheticCycle, runLocalQueueTest, updateLocalBo } from './services.local';
import type { LocalBo, QueueSummary } from './services.local';
import { toDashboardMetrics } from './queue/summary.mjs';
import { toUserError } from './services/errors.mjs';
import { useQueue } from './hooks/useQueue';

type Screen = 'splash' | 'welcome' | 'setup' | 'success' | 'dashboard';
type Dialog = 'review' | 'schedule' | 'filters' | 'settings' | null;

const CONFIG_KEY = 'sied-v5-demo-preferences';
const NATURES = ['Furto', 'Roubo', 'Perda / extravio', 'Estelionato', 'Ameaça', 'Dano', 'Outras naturezas'];

type Preferences = { configured: boolean; selectedNature: string[]; start: string; end: string; scheduleEnabled: boolean };
const DEFAULT_PREFS: Preferences = { configured: false, selectedNature: [], start: '08:00', end: '18:00', scheduleEnabled: false };
function loadPrefs(): Preferences {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFS;
    const value = parsed as Partial<Preferences>;
    return {
      configured: value.configured === true,
      selectedNature: Array.isArray(value.selectedNature) ? value.selectedNature.filter(x => typeof x === 'string' && NATURES.includes(x)) : [],
      start: typeof value.start === 'string' && /^\d\d:\d\d$/.test(value.start) ? value.start : '08:00',
      end: typeof value.end === 'string' && /^\d\d:\d\d$/.test(value.end) ? value.end : '18:00',
      scheduleEnabled: value.scheduleEnabled === true,
    };
  } catch { return DEFAULT_PREFS; }
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-symbol"><JusticeLogo size={compact ? 31 : 43} /></span>
    <div className="brand-words"><strong>SIED <span>SYSTEM V5</span></strong><small>INTELLIGENCE OPERATIONS</small></div>
  </div>;
}

function Modal({ title, kicker, children, onClose, wide = false }: { title: string; kicker: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal glass ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-heading"><div><span className="micro-label">{kicker}</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar janela" ref={closeRef}><X size={19}/></button></header>
      {children}
    </div>
  </div>;
}

function App() {
  const [prefs, setPrefs] = useState<Preferences>(loadPrefs);
  const [screen, setScreen] = useState<Screen>('splash');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [running, setRunning] = useState(false);
  const queue = useQueue();
  const localBos: LocalBo[] = queue.rows;
  const queueSummary: QueueSummary = queue.summary;
  const [lastActivity, setLastActivity] = useState('Nenhuma operação iniciada nesta sessão.');
  const [searchReview, setSearchReview] = useState('');
  const [editFilter, setEditFilter] = useState<string[]>(prefs.selectedNature);
  const [editStart, setEditStart] = useState(prefs.start);
  const [editEnd, setEditEnd] = useState(prefs.end);
  const [editSchedule, setEditSchedule] = useState(prefs.scheduleEnabled);
  const [toast, setToast] = useState('');
  const [newBoNumber, setNewBoNumber] = useState('');
  const [newBoNature, setNewBoNature] = useState('Perda / extravio');
  const [localError, setLocalError] = useState('');
  const runController = useRef<AbortController | null>(null);

  useEffect(() => { localStorage.setItem(CONFIG_KEY, JSON.stringify(prefs)); }, [prefs]);
  useEffect(() => {
    if (screen !== 'splash') return;
    const t = window.setTimeout(() => setScreen(prefs.configured ? 'dashboard' : 'welcome'), 3000);
    return () => window.clearTimeout(t);
  }, [screen, prefs.configured]);
  useEffect(() => {
    if (screen !== 'success') return;
    const t = window.setTimeout(() => setScreen('dashboard'), 1900);
    return () => window.clearTimeout(t);
  }, [screen]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const reviewRows = useMemo(() => localBos.filter(item => ['AGUARDANDO_REVISAO', 'ERRO', 'RESTRITO'].includes(item.status)), [localBos]);
  const visibleReviews = useMemo(() => reviewRows.filter(item => `${item.number} ${item.nature} ${item.reason} ${item.status}`.toLowerCase().includes(searchReview.toLowerCase())), [reviewRows, searchReview]);
  const filterSummary = prefs.selectedNature.length === 0 ? 'Todas as naturezas' : prefs.selectedNature.length === 1 ? prefs.selectedNature[0] : `${prefs.selectedNature.length} naturezas selecionadas`;
  const metrics = toDashboardMetrics(queueSummary);

  function openDialog(value: Dialog) {
    if (value === 'schedule') { setEditStart(prefs.start); setEditEnd(prefs.end); setEditSchedule(prefs.scheduleEnabled); }
    if (value === 'filters') setEditFilter(prefs.selectedNature);
    if (value === 'review') setSearchReview('');
    setDialog(value);
  }
  function completeSetup() {
    // Never persist credentials or MFA material; this verifies ONLY the demo onboarding.
    setPrefs(current => ({ ...current, configured: true }));
    setScreen('success');
  }
  function applyFilters() {
    setPrefs(current => ({ ...current, selectedNature: editFilter }));
    setDialog(null); setToast('Filtro demonstrativo atualizado.');
  }
  function saveSchedule() {
    if (editStart === editEnd && editSchedule) { setToast('Defina horários de início e fim diferentes.'); return; }
    setPrefs(current => ({ ...current, start: editStart, end: editEnd, scheduleEnabled: editSchedule }));
    setDialog(null); setToast('Janela de horário salva no dispositivo (sem execução automática).');
  }
  async function handleOpenPortal() {
    try {
      if (desktopAvailable) await openOfficialPortal();
      else window.open('https://seguranca.sinesp.gov.br/sinesp-seguranca/login.jsf', '_blank', 'noopener,noreferrer');
      setToast('Acesso oficial aberto. CPF, senha e OTP devem ser informados somente no portal.');
    } catch (error) {
      setToast(toUserError(error, 'Não foi possível abrir o portal neste ambiente.'));
    }
  }
  async function handleAddLocalBo() {
    setLocalError('');
    try {
      await addLocalBo(newBoNumber.trim(), newBoNature);
      setNewBoNumber('');
      setToast('B.O. registrado na fila local. Nenhuma ação foi feita no PPE.');
      queue.refresh();
    } catch (error) {
      setLocalError(toUserError(error, 'Falha ao adicionar B.O. à fila.'));
    }
  }
  async function handleRunQueue() {
    if (running) {
      runController.current?.abort();
      setLastActivity('Interrupção solicitada pelo operador.');
      return;
    }
    if (desktopAvailable) {
      setLocalError('');
      try {
        const result = await runDesktopSyntheticCycle();
        setLastActivity(`Ciclo sintético concluído: ${result.number} → ${result.nextStatus}`);
        setToast(`Simulação sintética local: ${result.number} marcado como LIDO (${result.recognizedTabs.length} abas). Nenhuma leitura do PPE real foi feita.`);
        queue.refresh();
      } catch (error) {
        setLocalError(toUserError(error, 'Falha ao executar o ciclo sintético.'));
      }
      return;
    }

    const controller = new AbortController();
    runController.current = controller;
    setRunning(true);
    setLocalError('');
    try {
      const result = await runLocalQueueTest({
        signal: controller.signal,
        onProgress: event => setLastActivity(
          event.status === 'EM_LEITURA'
            ? `Leitura estrutural fictícia iniciada: ${event.number}`
            : `B.O. fictício encaminhado para revisão: ${event.number}`,
        ),
      });
      queue.refresh();
      if (result.stoppedReason === 'CANCELADO') setToast('Teste local interrompido com segurança.');
      else setToast(`${result.processed} B.O. fictício(s) processado(s) até revisão.`);
    } catch (error) {
      setLocalError(toUserError(error, 'Falha ao processar a fila local.'));
    } finally {
      runController.current = null;
      setRunning(false);
    }
  }
  async function handleValidateLocalBo(number: string) {
    if (desktopAvailable || !/^TESTE-/i.test(number)) {
      setLocalError('A validação nesta tela está limitada a dados fictícios do teste local.');
      return;
    }
    setLocalError('');
    try {
      await updateLocalBo(
        number,
        'VALIDADO_PELO_RESPONSAVEL',
        'Validação humana registrada no teste local; nenhuma ação foi feita no PPE.',
      );
      queue.refresh();
      setLastActivity(`B.O. fictício validado pelo responsável: ${number}`);
      setToast('Validação local registrada. O PPE não foi alterado.');
    } catch (error) {
      setLocalError(toUserError(error, 'Falha ao registrar a validação local.'));
    }
  }
  async function handlePrepareFinalization(number: string) {
    const row = localBos.find(item => item.number === number);
    if (desktopAvailable || !/^TESTE-/i.test(number) || row?.status !== 'VALIDADO_PELO_RESPONSAVEL') {
      setLocalError('A preparação para finalização está limitada a dados fictícios já validados.');
      return;
    }
    setLocalError('');
    try {
      await updateLocalBo(
        number,
        'AGUARDANDO_FINALIZACAO',
        'Teste local preparado para finalização; nenhuma ação foi feita no PPE.',
      );
      queue.refresh();
      setLastActivity(`B.O. fictício preparado para finalização: ${number}`);
      setToast('Preparação local registrada. Assinatura e conclusão não foram executadas.');
    } catch (error) {
      setLocalError(toUserError(error, 'Falha ao preparar a finalização local.'));
    }
  }
  function restartOnboarding() {
    setRunning(false); setDialog(null);
    setPrefs(current => ({ ...current, configured: false }));
    setScreen('welcome');
  }

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/><div className="grid-texture"/>

    {screen === 'splash' && <main className="full-screen splash-page screen-appear">
      <div className="splash-aura"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="splash-logo"><JusticeLogo size={95}/></div></div>
      <p className="micro-label welcome-caption">JUSTICE · INTELLIGENCE · CONTROL</p>
      <h1 className="intro-heading metallic-text">SIED <span>SYSTEM V5</span></h1>
      <p className="splash-description">Uma nova dimensão em controle operacional</p>
      <div className="loading-track"><span/></div>
      <span className="loading-caption">INICIALIZANDO INTERFACE</span>
      <p className="splash-footer">SIED SYSTEM · VERSÃO ASSISTIDA 0.4</p>
    </main>}

    {screen === 'welcome' && <main className="full-screen welcome-page screen-appear">
      <div className="welcome-hero-logo"><div className="welcome-logo-frame"><JusticeLogo size={92}/></div></div>
      <span className="micro-label welcome-caption">WELCOME TO THE NEXT GENERATION</span>
      <h1 className="intro-heading metallic-text">SIED <span>SYSTEM V5</span></h1>
      <p className="welcome-description">Inteligência, precisão e controle.<br/>Um ambiente feito para operar com confiança.</p>
      <button className="button button-primary welcome-button" onClick={() => setScreen('setup')}><Settings2 size={18}/> CONFIGURAR SISTEMA <ArrowRight size={17}/></button>
      <p className="welcome-footnote"><LockKeyhole size={13}/> Projeto local · Sem conexão com serviços externos</p>
    </main>}

    {screen === 'setup' && <main className="full-screen setup-page screen-appear">
      <div className="setup-topline"><Brand compact/><span className="step-chip">ETAPA 01 / 01</span></div>
      <div className="setup-card glass">
        <div className="setup-card-head"><div className="setup-emblem"><Shield size={25}/></div><span className="micro-label">CONFIGURAÇÃO INICIAL</span><h1>Conexão com o PPE</h1><p>Autenticação pelo portal SINESP oficial.</p></div>
        <div className="demo-warning"><AlertTriangle size={17}/><span><strong>Não digite CPF, senha ou OTP no SIED.</strong> A autenticação é feita somente no endereço oficial. Nenhum código do autenticador será copiado ou armazenado.</span></div>
        <div className="mfa-option" style={{ cursor:'default' }}><span className="mfa-icon"><Fingerprint size={25}/></span><span><strong>Autenticação oficial em três etapas</strong><small>CPF → Senha → OTP no navegador Edge.</small></span><ShieldCheck size={18}/></div>
        <p className="setup-security"><LockKeyhole size={13}/> O perfil do navegador permanece no computador, sujeito à expiração da sessão e às políticas do SINESP.</p>
        <button className="button button-secondary full-width" style={{ marginBottom:12 }} onClick={handleOpenPortal}><Shield size={18}/> ABRIR PORTAL SINESP <ArrowRight size={17}/></button>
        <button className="button button-primary full-width" onClick={completeSetup}><Check size={18}/> CONTINUAR PARA PAINEL <ArrowRight size={17}/></button>
        <button className="subtle-back" onClick={() => setScreen('welcome')}><ArrowLeft size={15}/> Voltar</button>
      </div>
    </main>}

    {screen === 'success' && <main className="full-screen success-page screen-appear">
      <div className="success-halo"><div className="success-check"><Check size={62} strokeWidth={2}/></div></div>
      <span className="micro-label success-label">CONFIGURAÇÃO LOCAL</span>
      <h1>Configuração concluída</h1>
      <p>Preparando seu painel de controle...</p>
      <div className="success-progress"><span/></div>
      <span className="success-disclaimer">Painel local pronto · A autenticação continua no portal oficial</span>
    </main>}

    {screen === 'dashboard' && <main className="workspace screen-appear">
      <header className="workspace-header"><Brand compact/><div className="header-right"><span className="demo-label"><span className="demo-pulse"/> MODO LOCAL ASSISTIDO</span><span className="vertical-separator"/><button className="header-settings" aria-label="Configurações" title="Configurações" onClick={() => openDialog('settings')}><Settings2 size={19}/></button></div></header>
      <div className="workspace-content">
        <div className="page-intro"><div><span className="micro-label">OPERATIONAL OVERVIEW / V5</span><h1>Central de controle <span className="intro-spark"><Sparkles size={19}/></span></h1><p>Seu centro inteligente de gerenciamento de ocorrências.</p></div><div className={`state-badge ${running ? 'state-running' : ''}`}><span className="state-dot"/>{running ? 'SISTEMA EM EXECUÇÃO' : 'SISTEMA EM ESPERA'}</div></div>
        <div className="metrics-grid">
          <section className="metric-card glass"><div className="metric-top"><span>NA FILA</span><span className="metric-icon"><FileClock size={22}/></span></div><div className="metric-figure">{metrics.queue.toString().padStart(2,'0')}</div><div className="metric-caption">Registros locais em fluxo permitido</div><div className="metric-bottom"><span className="metric-tick"/><span>Dados persistidos no SQLite</span></div></section>
          <section className="metric-card glass"><div className="metric-top"><span>CONCLUÍDOS</span><span className="metric-icon metric-icon-green"><CheckCheck size={22}/></span></div><div className="metric-figure">{metrics.completed.toString().padStart(2,'0')}</div><div className="metric-caption">Conclusões verificadas localmente</div><div className="metric-bottom"><span className="metric-tick green"/><span>{metrics.total} registro(s) no total</span></div></section>
          <button type="button" className="metric-card review-card glass" onClick={() => openDialog('review')}><div className="metric-top"><span>PRECISAM DE REVISÃO</span><span className="metric-icon metric-icon-lime"><AlertTriangle size={22}/></span></div><div className="metric-figure review-figure">{metrics.review.toString().padStart(2,'0')}</div><div className="metric-caption">Revisão, erro ou acesso restrito</div><div className="metric-bottom review-cta"><span>VER BOLETINS</span><ArrowRight size={15}/></div></button>
        </div>
        <div className="content-grid">
          <section className="operation-panel glass"><div className="panel-header"><div><span className="micro-label">OPERATION CONTROL</span><h2>Automação inteligente</h2></div><span className="panel-head-icon"><Gauge size={23}/></span></div><p className="panel-description">Controle o fluxo de trabalho com um clique e ajuste como as ocorrências serão selecionadas.</p>
            <div className="primary-actions"><button className={`button button-execute ${running ? 'button-pause' : ''}`} onClick={handleRunQueue} disabled={!running && metrics.queue===0}>{running ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}{running ? 'PAUSAR' : desktopAvailable ? 'INICIAR' : 'INICIAR TESTE LOCAL'}<span className="action-suffix">{running ? 'Ⅱ' : '↗'}</span></button><button className="button button-secondary" onClick={() => openDialog('schedule')}><CalendarClock size={19}/> PROGRAMAR <ArrowRight size={16}/></button></div>
            <button type="button" className="filter-control" onClick={() => openDialog('filters')}><span className="filter-icon"><SlidersHorizontal size={20}/></span><span className="filter-content"><small>FILTRO DE OCORRÊNCIAS</small><strong>{filterSummary}</strong></span><ChevronDown size={19}/></button>
            <div className="operation-status"><div className={`op-status-icon ${running ? 'pulsing' : ''}`}><Activity size={18}/></div><div><strong>{running ? 'Processamento local em andamento' : 'Pronto para iniciar'}</strong><span>{running ? 'Nenhum ato oficial é executado neste teste.' : desktopAvailable ? 'Aguardando bridge PPE desktop.' : 'Use apenas identificadores fictícios iniciados por TESTE-.'}</span></div><span className={`op-status-light ${running ? 'active' : ''}`}/></div>
          </section>
          <section className="insights-panel glass"><div className="panel-header"><div><span className="micro-label">SYSTEM STATUS</span><h2>Visão do sistema</h2></div><BarChart3 size={21} className="muted-icon"/></div><div className="progress-block"><div className="progress-heading"><span>Progresso geral <CircleHelp size={13}/></span><strong>{metrics.progress}%</strong></div><div className="progress-track"><div className="progress-value" style={{ width: `${metrics.progress}%` }}/></div><span className="progress-hint">Conclusões verificadas sobre a fila local</span></div><div className="divider"/><div className="detail-row"><span><ShieldCheck size={16}/> Ambiente</span><strong>Local / Seguro</strong></div><div className="detail-row"><span><Clock3 size={16}/> Agendamento</span><strong>{prefs.scheduleEnabled ? `${prefs.start} — ${prefs.end}` : 'Desativado'}</strong></div><div className="detail-row"><span><FileText size={16}/> Integração PPE</span><strong className="text-muted">Leitor separado</strong></div><div className="divider"/><div className="activity-label"><span className="activity-dot"/> ÚLTIMA ATIVIDADE</div><p className="activity-text">{lastActivity}</p></section>
        </div>
        <section className="glass guided-panel" aria-label="Inspeção assistida e fila local">
          <div className="guided-panel-header"><div><span className="micro-label">PPE / INTEGRAÇÃO ASSISTIDA</span><h2>Portal oficial e fila persistente</h2><p>Abra a sessão oficial e utilize a fila local para organizar seu trabalho. Nenhuma assinatura ou despacho é executado por esta tela.</p></div><button className="button button-secondary" onClick={handleOpenPortal}><ShieldCheck size={17}/> ABRIR SINESP</button></div>
          <div className="guided-grid"><div><span className="micro-label">CADASTRAR NA FILA LOCAL</span><div className="guided-form"><input aria-label="Número do boletim" value={newBoNumber} onChange={event => setNewBoNumber(event.target.value)} placeholder={desktopAvailable ? '00000000/2026' : 'TESTE-LOCAL/2026'} maxLength={80}/><select aria-label="Natureza" value={newBoNature} onChange={event => setNewBoNature(event.target.value)}>{NATURES.map(nature => <option value={nature} key={nature}>{nature}</option>)}</select><button className="button button-primary" onClick={handleAddLocalBo}>ADICIONAR</button></div><p className="guided-hint">{desktopAvailable ? 'Armazenamento SQLite local. Adicionar não altera o PPE.' : 'Modo navegador funcional: use TESTE-* para validar o fluxo até revisão. Nenhuma operação é feita no PPE.'}</p>{localError && <p role="alert" className="guided-error">{localError}</p>}</div><div className="guided-queue"><span className="micro-label">FILA LOCAL · {localBos.length} REGISTROS</span>{!queue.hasData && queue.loading ? <p className="guided-hint">Carregando fila local...</p> : !queue.hasData && queue.error ? <p className="guided-hint" role="alert">Banco local indisponível: {queue.error} <button className="button button-small button-secondary" onClick={queue.refresh}>Tentar atualizar</button></p> : localBos.length === 0 ? <p className="guided-hint">Nenhum B.O. adicionado ao banco local.</p> : <div className="guided-items">{localBos.slice(0,5).map(bo => <div className="guided-item" key={bo.number}><span>{bo.number}</span><small>{bo.status.replaceAll('_', ' ')}</small>{!desktopAvailable && /^TESTE-/i.test(bo.number) && bo.status === 'VALIDADO_PELO_RESPONSAVEL' && <button className="button button-secondary button-small" aria-label={`PREPARAR FINALIZAÇÃO ${bo.number}`} onClick={() => handlePrepareFinalization(bo.number)}><CheckCheck size={14}/> PREPARAR FINALIZAÇÃO</button>}</div>)}</div>}{queue.hasData && queue.error && <p className="guided-hint" role="alert">Última atualização falhou: {queue.error} <button className="button button-small button-secondary" onClick={queue.refresh}>Tentar atualizar</button></p>}</div></div>
          <div className="notice"><CircleHelp size={17}/> Para testar a leitura real em modo assistido, execute no Windows <code>npm run ppe:inspecionar</code>. O script espera o login manual e interrompe diante de elementos ambíguos.</div>
        </section>
        <footer className="workspace-footer"><span><LockKeyhole size={13}/> SIED SYSTEM V5 · Fila local real; leitura PPE assistida e independente</span><span>{desktopAvailable ? 'DESKTOP' : 'BROWSER LOCAL'} <span className="footer-separator">/</span> V0.4.0</span></footer>
      </div>
    </main>}

    {dialog === 'review' && <Modal title="Boletins para revisão" kicker="REVIEW QUEUE / BANCO LOCAL" onClose={() => setDialog(null)} wide>
      <div className="modal-intro">Registros locais em revisão, erro ou acesso restrito. O conteúdo integral do B.O. não é exibido nem registrado aqui.</div>
      <label className="searchbox"><Search size={18}/><input value={searchReview} placeholder="Buscar por número, natureza ou estado" onChange={ev => setSearchReview(ev.target.value)} aria-label="Buscar boletim na revisão local"/></label>
      <div className="review-list">{visibleReviews.length ? visibleReviews.map(item => <div className="review-item" key={item.number}><div className="review-doc-icon"><FileText size={19}/></div><div className="review-data"><strong>{item.number}</strong><span>{item.nature} · {item.updatedAt}</span><small>{item.reason || 'Revisão humana necessária.'}</small></div><span className="review-state"><AlertTriangle size={12}/> {item.status.replaceAll('_', ' ')}</span>{!desktopAvailable && /^TESTE-/i.test(item.number) && item.status === 'AGUARDANDO_REVISAO' && <button className="button button-primary button-small" aria-label={`VALIDAR ${item.number}`} onClick={() => handleValidateLocalBo(item.number)}><Check size={14}/> VALIDAR</button>}</div>) : <div className="empty-results">Nenhuma ocorrência encontrada.</div>}</div>
      <div className="modal-footer"><span>{visibleReviews.length} registro(s) encontrado(s)</span><button className="button button-secondary button-small" onClick={() => setDialog(null)}>Fechar janela</button></div>
    </Modal>}

    {dialog === 'schedule' && <Modal title="Programar execução" kicker="SCHEDULE / AGENDAMENTO LOCAL" onClose={() => setDialog(null)}>
      <div className="modal-intro">Escolha o horário desejado. Nesta versão o agendamento é salvo apenas como preferência, sem executar tarefas automaticamente.</div>
      <label className="toggle-row"><span><strong>Habilitar programação</strong><small>Prévia visual de agendamento</small></span><input type="checkbox" checked={editSchedule} onChange={ev => setEditSchedule(ev.target.checked)}/><span className="switch-ui"/></label>
      <div className="time-grid"><label>HORÁRIO DE INÍCIO<input type="time" value={editStart} onChange={ev => setEditStart(ev.target.value)}/></label><label>HORÁRIO DE TÉRMINO<input type="time" value={editEnd} onChange={ev => setEditEnd(ev.target.value)}/></label></div>
      <div className="notice"><CircleHelp size={17}/> Para uma versão operacional futura, o Windows deverá estar ligado e a autenticação oficial ainda poderá expirar.</div>
      <button className="button button-primary full-width" onClick={saveSchedule}><Check size={18}/> SALVAR PROGRAMAÇÃO</button>
    </Modal>}

    {dialog === 'filters' && <Modal title="Filtrar naturezas" kicker="FILTERS / SELEÇÃO DE BOLETINS" onClose={() => setDialog(null)}>
      <div className="modal-intro">Selecione as naturezas desejadas ou deixe todas habilitadas. Os filtros afetam somente as preferências da demonstração.</div>
      <div className="filter-options"><button className={`filter-option ${editFilter.length===0 ? 'selected' : ''}`} onClick={() => setEditFilter([])}><span className="fake-checkbox">{editFilter.length===0 && <Check size={13}/>}</span><span>Todas as naturezas</span></button>{NATURES.map(kind => <button key={kind} className={`filter-option ${editFilter.includes(kind) ? 'selected' : ''}`} onClick={() => setEditFilter(prev => prev.includes(kind) ? prev.filter(x => x !== kind) : [...prev, kind])}><span className="fake-checkbox">{editFilter.includes(kind) && <Check size={13}/>}</span><span>{kind}</span></button>)}</div>
      <button className="button button-primary full-width" onClick={applyFilters}><Check size={18}/> APLICAR FILTROS</button>
    </Modal>}

    {dialog === 'settings' && <Modal title="Configurações" kicker="SYSTEM / PREFERÊNCIAS" onClose={() => setDialog(null)}>
      <div className="modal-intro">Preferências e metadados mínimos da fila ficam no banco local. Não são armazenados CPF, senha, OTP, conteúdo integral de boletins, documentos ou arquivos policiais.</div>
      <div className="settings-row"><span><ShieldCheck size={20}/><span><strong>Configuração inicial</strong><small>Demonstrativa · salva localmente</small></span></span><span className="setting-ok">CONCLUÍDA</span></div>
      <div className="settings-row"><span><Scale size={20}/><span><strong>SINESP / PPE</strong><small>Nenhuma conexão estabelecida</small></span></span><span className="setting-off">OFFLINE</span></div>
      <button className="button button-secondary full-width" onClick={restartOnboarding}><RotateCcw size={17}/> REFAZER CONFIGURAÇÃO DEMO</button>
    </Modal>}

    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>;
}
export default App;
