import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const VERSION = '1.0.0';
const load = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const transitions = load('./transitions.json');
const help = load('./ajuda.json');
const scenarios = { C2: load('./scenarios/C2.json'), C4: load('./scenarios/C4.json') };
const grading = { C2: load('./evaluator/C2.json'), C4: load('./evaluator/C4.json') };
const GRID = [[0, .15, .35, .55], [0, 1, 3], [0, 1, 3], [0, 2, 5]];
const hash = text => createHash('sha256').update(text).digest('hex');
const random = label => Number.parseInt(hash(label).slice(0, 8), 16) / 2 ** 32;
const stateText = { pending: 'Sem confirmação registrada', reported: 'Tomada relatada' };
const conclusionText = { ingested: 'ingerido', not_ingested: 'não ingerido', indeterminate: 'indeterminado' };

export function configuration(mode, seed) {
  if (!['sampled', 'fixed', 'neutral'].includes(mode)) throw new Error('Configuração inválida');
  const [q, k, a, l] = mode === 'sampled'
    ? GRID.map((grid, i) => grid[Math.floor(random(seed + ':parameter:' + i) * grid.length)])
    : mode === 'fixed' ? [.35, 1, 1, 5] : [0, Infinity, Infinity, 0];
  return { mode, seed, q, k, a, l };
}

function record(session, type, data = {}) {
  const attempt = session.attempt;
  session.events.push({
    id: session.id + ':' + (session.events.length + 1), sequence: session.events.length + 1,
    timestamp: new Date().toISOString(), type, session: session.id, persona: 'Helena (fictícia)',
    task: attempt?.task ?? null, variant: attempt?.variant ?? null, position: session.position,
    configuration: session.config.mode, origin: session.origin, scene: attempt?.screen ?? null, ...data,
  });
}

export function createSession({ id, mode = 'fixed', seed = 20261026, origin = 'technical' } = {}) {
  const config = configuration(mode, seed);
  const session = { id, config, origin, learned: [], events: [], position: 0 };
  record(session, 'session_started', {
    version: VERSION, seed, parameters: { ...config, k: Number.isFinite(config.k) ? config.k : 'unlimited', a: Number.isFinite(config.a) ? config.a : 'unlimited' },
  });
  return session;
}

export function closeSession(session) {
  if (session.attempt && !session.attempt.result) throw new Error('Tentativa ainda aberta');
  record(session, 'session_closed');
}

export function startTask(session, task, variant) {
  if (!Object.hasOwn(scenarios, task) || !['A', 'B'].includes(variant)) throw new Error('Selecione uma tarefa C e variante A/B');
  if (session.attempt && !session.attempt.result) throw new Error('Tentativa ainda aberta');
  if (session.position === 2) throw new Error('Sessão limitada a duas tentativas');
  const initial = structuredClone(scenarios[task]);
  session.position += 1;
  session.attempt = {
    task, variant, initial, screen: initial.initial_screen, focus: initial.initial_occurrence_id,
    items: structuredClone(initial.occurrences), date: '2026-10-26', answer: null,
    visit: 1, turn: 0, proposed: 0, executed: 0, invalid: 0, helpUses: 0,
    consultations: new Set(), memory: [], anchors: [], errors: [], opportunity: 0, channel: null,
  };
  record(session, 'task_started', { clock: initial.clock });
  seen(session);
}

function currentItem(at) {
  return at.items.find(item => item.occurrence_id === at.focus);
}

function personLabel(item) {
  return 'Item ' + item.item + ' · ' + item.time + ' · ' + item.date.split('-').reverse().join('/');
}

function setScreen(at, screen, focus = null) {
  at.screen = screen;
  at.focus = focus;
  at.visit++;
}

function seen(session) {
  const at = session.attempt;
  const item = currentItem(at);
  if (item && ['R','D','U'].includes(at.screen)) at.consultations.add(at.screen + ':' + item.occurrence_id);
  const view = publicView(session);
  record(session, 'screen_viewed', { d: view.heading, displayed_content: view.content, occurrence: item?.occurrence_id ?? null });
}

function valueLabel(at, item) {
  if (item.state === 'reported') return 'Tomada relatada às ' + item.reported_at.slice(11, 16);
  return at.variant === 'A' && at.screen === 'R' ? 'Pendente' : 'Sem confirmação registrada';
}

export function publicView(session) {
  const at = session.attempt;
  const item = currentItem(at);
  const compact = at.variant === 'A';
  const content = [];
  const actions = [];
  const button = (kind, label, target = null, alias = null) => {
    if (!transitions[at.screen].includes(kind)) throw new Error('Transição não prevista: ' + kind);
    actions.push({ kind, label, target, alias });
  };
  const titles = { I:'Lembretes', R:'Lembrete', H:'Histórico', D:'Detalhes do registro', U:'Último registro', E:'Confirmar correção', J:'Ajuda sobre os estados', F:'Tentativa encerrada' };
  if (['R','D','U','E'].includes(at.screen)) {
    if (item) content.push(personLabel(item));
    else content.push('Nenhum relato válido.');
  }
  if (item && ['D','U'].includes(at.screen)) {
    content.push(valueLabel(at,item));
    if (at.screen === 'D') {
      content.push(item.reminder_presented ? 'Lembrete apresentado' : 'Sem lembrete apresentado');
      for (const entry of item.report_voided) content.push('Relato anterior desfeito às ' + entry.voided_at.slice(11,16));
    }
  }
  if (at.screen === 'R' && item) {
    content.push(item.state === 'reported' && compact
      ? at.flash ?? 'Consulte o histórico para ver o registro'
      : valueLabel(at,item));
    if (item.state === 'pending') button('report', compact ? 'OK' : 'Registrar que tomei', null, compact ? 'OK' : null);
    button('close_reminder','Fechar lembrete');
  }
  if (at.screen === 'I') {
    for (const entry of at.items.filter(entry => entry.reminder_presented && entry.date === at.date)) {
      button('reminder',personLabel(entry),entry.occurrence_id);
    }
  }
  if (at.screen === 'H') {
    content.push(at.date === '2026-10-26' ? 'Hoje · 26/10/2026' : 'Ontem · 25/10/2026');
    button('date', 'Hoje','2026-10-26');
    button('date', 'Ontem','2026-10-25');
    for (const entry of at.items.filter(entry => entry.date === at.date)) button('detail', personLabel(entry), entry.occurrence_id);
  }
  if (at.screen === 'D') button('back', 'Voltar ao histórico');
  if (item?.state === 'reported' && ['U','D'].includes(at.screen))
    button('correct', compact ? '✎' : 'Corrigir relato', null, compact ? 'lápis' : null);
  if (at.screen === 'E') {
    content.push('Deseja desfazer este relato? A correção permanece no histórico.');
    button('cancel', 'Cancelar');
    button('void', 'Confirmar correção');
  }
  if (at.screen === 'J') {
    content.push(help.text);
    if (at.helpLayer === 'expandida') content.push('Para conferir um horário, compare item, data e hora no detalhe. Um relato desfeito é histórico de uma correção. Para sair da ajuda, use Voltar à tarefa.');
    else button('help_more','Entender os registros');
    button('close_help','Voltar à tarefa');
  }
  for (const [kind,label,alias] of [
    ['home','Início',null], ['history',compact ? 'Hist.' : 'Ver histórico',compact ? 'Hist.' : null],
    ['latest',compact ? 'Último' : 'Ver último registro',null], ['help','Ajuda',null],
  ]) if (transitions[at.screen].includes(kind)) button(kind,label,null,alias);
  if (transitions[at.screen].includes('answer')) {
    if (at.answer) content.push('Resposta selecionada: ' + answerLabel(at,at.answer));
    for (const entry of at.initial.public_answers) button('answer',answerLabel(at,entry),entry);
  }
  if (transitions[at.screen].includes('finish')) button('finish','Concluir');
  if (transitions[at.screen].includes('quit')) button('quit','Desistir');
  if (at.screen === 'F') content.push('A tentativa foi encerrada.');
  return { heading: titles[at.screen], content, actions };
}

function answerLabel(at, answer) {
  if (at.task === 'C2') return 'Alfa: ' + stateText[answer[0]] + ' · Beta: ' + stateText[answer[1]];
  return stateText[answer[0]] + ' · Ingestão: ' + conclusionText[answer[1]];
}

function addBounded(queue, entry, limit) {
  const next = queue.filter(e => e.key !== entry.key).concat(entry);
  return limit === Infinity ? next : next.slice(Math.max(0, next.length - limit));
}

export function observe(session, channel = 'agent') {
  const at = session.attempt;
  if (at.channel && at.channel !== channel) throw new Error('Canal já definido para esta tentativa');
  at.channel = channel;
  const view = publicView(session);
  const salt = session.id + ':' + session.position + ':' + at.turn;
  const id = hash(salt + ':obs').slice(0, 20);
  const permitted = [];
  const omissions = [];
  for (const [index,action] of view.actions.entries()) {
    const known = session.learned.some(entry => entry.aliases.includes(action.alias));
    const unstable = random([session.config.seed,session.position,at.visit,action.alias].join(':'));
    if (channel === 'agent' && action.alias && !known && unstable < session.config.q) {
      omissions.push(action.label);
      continue;
    }
    permitted.push({ ...action, id: hash(salt + ':' + index).slice(0, 18) });
  }
  at.allowed = new Map(permitted.map(a=>[a.id,a]));
  at.observation = id;
  const observation = {
    observation_id: id, instruction: at.initial.instruction, heading: view.heading, content: view.content,
    allowed_actions: permitted.map(({id,label}) => ({id,label})),
  };
  if (channel === 'agent') {
    observation.memory = at.memory.map(e => e.display);
    observation.anchors = at.anchors.map(e => e.display);
    observation.learned = session.learned.map(({aliases,meaning}) => ({ aliases,meaning }));
  }
  record(session,'observation_emitted',{ observation_id: id, omissions });
  const item = currentItem(at);
  if (channel === 'agent' && item && ['D','R','U'].includes(at.screen)) {
    at.memory = addBounded(at.memory,{key: at.screen + ':' + item.occurrence_id, display:{ heading:view.heading, content:view.content.filter(t=>!t.startsWith('Resposta selecionada:')) }},session.config.k);
    if (['D','U'].includes(at.screen)) {
      at.anchors = addBounded(at.anchors,{key:at.screen + ':' + item.occurrence_id, display:{ heading:view.heading, occurrence:personLabel(item) }},session.config.a);
    }
  }
  return observation;
}

function error(session, code, data = {}) {
  const at=session.attempt;
  const e={ id: at.errors.length + 1, code, ...data };
  at.errors.push(e);
  record(session,'error_marked', {error:e});
}

function assess(at) {
  const criteria=grading[at.task];
  const missing=criteria.required_consults.filter(rule =>
    !rule.screens.some(screen=>at.consultations.has(screen+':'+rule.occurrence_id)));
  const helpMissing=criteria.required_help && !at.helpUses;
  const answerCorrect=JSON.stringify(at.answer)===JSON.stringify(criteria.expected_answer);
  const preserved=JSON.stringify(at.items)===JSON.stringify(at.initial.occurrences);
  return { missing, helpMissing, answerCorrect, preserved, success: !missing.length && !helpMissing && answerCorrect && preserved };
}

export function finish(session, reason) {
  const at=session.attempt;
  if (at.result) return at.result;
  const result=assess(at);
  if (['finish','quit'].includes(reason)) {
    for (const rule of result.missing) error(session,'E4',{requirement:'consult:'+rule.occurrence_id});
    if (result.helpMissing) error(session,'E4',{requirement:'help'});
    if (!at.answer) error(session,'E4',{requirement:'answer'});
  }
  if (reason==='technical') record(session,'technical_failure');
  at.result={
    status: reason==='technical' ? 'unknown' : reason==='finish' && result.success ? 'success' : 'failure',
    reason, actions:at.executed, opportunities:at.opportunity, help:at.helpUses,
    errors:at.errors.map(e=>e.code),
  };
  setScreen(at,'F');
  record(session,'task_closed',{result:at.result});
  return at.result;
}

export function execute(session, proposal) {
  const at=session.attempt;
  if (at.result) throw new Error('Tentativa já encerrada');
  at.proposed++;
  const keys = proposal && Object.keys(proposal).sort().join(',');
  const args = proposal?.arguments;
  const noArguments = args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0;
  const validShape = keys === 'action_id,observation_id' || (keys === 'action_id,arguments,observation_id' && noArguments);
  const action=validShape && proposal.observation_id===at.observation && at.allowed?.get(proposal.action_id);
  record(session,'action_proposed',{ observation_id:at.observation, proposed_id: typeof proposal?.action_id === 'string' ? proposal.action_id : null });
  if (!action) {
    at.invalid++;
    at.turn++;
    at.observation=null;
    at.allowed=null;
    record(session,'action_rejected');
    if (at.invalid >= 3) finish(session,'technical');
    else if (at.proposed >= 60) finish(session,'limit');
    return false;
  }
  at.invalid=0;
  at.turn++;
  at.allowed=null;
  at.observation=null;
  at.executed++;
  at.flash=null;
  const {kind,target,label}=action;
  const item=currentItem(at);
  record(session,'action_executed',{u:label,action:kind});
  if (['report','void','answer'].includes(kind)) at.opportunity++;
  switch (kind) {
    case 'home': at.date='2026-10-26'; setScreen(at,'I'); break;
    case 'close_reminder': setScreen(at,'I'); break;
    case 'reminder': setScreen(at,'R',target); break;
    case 'history': case 'back': setScreen(at,'H'); break;
    case 'date': at.date=target; setScreen(at,'H'); break;
    case 'detail': setScreen(at,'D',target); break;
    case 'latest': {
      const latest=at.items.filter(x=>x.state==='reported').sort((a,b)=>b.reported_at.localeCompare(a.reported_at))[0];
      setScreen(at,'U',latest?.occurrence_id);
      break;
    }
    case 'report':
      if (item.state==='reported') error(session,'E2',{requirement:'preserve_all'});
      else {
        item.state='reported'; item.report_id='r' + at.turn; item.reported_at=item.date+'T'+at.initial.clock+':00'; item.public_version++;
        at.flash='Salvo';
        error(session,'E1',{requirement:'preserve_all'});
        record(session,'report_created',{occurrence:item.occurrence_id});
      }
      break;
    case 'correct': at.correctionOrigin=at.screen; setScreen(at,'E',at.focus); break;
    case 'cancel': setScreen(at,at.correctionOrigin,at.focus); break;
    case 'void': {
      const audit={report_id:item.report_id,voided_at:item.date+'T'+at.initial.clock+':00'};
      item.report_voided.push(audit); item.state='pending'; item.report_id=null; item.reported_at=null; item.public_version++;
      error(session,'E1',{requirement:'preserve_all'});
      record(session,'report_voided',{occurrence:item.occurrence_id});
      setScreen(at,'D',at.focus);
      break;
    }
    case 'help':
      at.helpOrigin={screen:at.screen,focus:at.focus};
      at.helpLayer='local';
      deliverHelp(session);
      break;
    case 'help_more': at.helpLayer='expandida'; deliverHelp(session); break;
    case 'close_help': setScreen(at,at.helpOrigin.screen,at.helpOrigin.focus); break;
    case 'answer': {
      at.answer=target;
      if (!assess(at).answerCorrect) error(session,'E3',{requirement:'answer'});
      else for (const item of at.errors.filter(e=>e.code==='E3' && !e.resolved)) {
        item.resolved=true;
        record(session,'error_resolved',{ error_id:item.id });
      }
      break;
    }
    case 'finish': case 'quit': finish(session,kind); break;
    default: throw new Error('Transição sem implementação');
  }
  if (!at.result) {
    seen(session);
    if (at.executed>=40 || at.proposed>=60) finish(session,'limit');
  }
  return true;
}

function deliverHelp(session) {
  const at=session.attempt;
  at.helpUses++;
  const metadata={request_id:at.helpUses, layer:at.helpLayer, topic:'estados e registros', return_scene:at.helpOrigin.screen};
  record(session,'help_requested',metadata);
  setScreen(at,'J');
  record(session,'help_delivered',metadata);
  if (at.channel==='agent') {
    session.learned=help.dictionary_insertion_order.reduce(
      (queue,entry)=>addBounded(queue,{...entry,key:entry.association_id},session.config.l),session.learned);
    record(session,'learning_updated',{size:session.learned.length});
  }
}

export function macEvents(events) {
  const previous=new Map();
  return events.flatMap(e=>{
    if (e.type==='help_requested') return [{at:e.id,tag:'Socorro!'}];
    if (e.type==='task_closed' && e.result.reason==='quit') return [{at:e.id,tag:'Desisto'}];
    if (e.type==='task_closed' && e.result.reason==='finish' && e.result.status==='failure') return [{at:e.id,tag:'Para mim está bom'}];
    if (e.type==='action_executed') {
      const k=e.position + ':' + e.scene + ':' + e.u;
      if (e.action==='cancel') return [{at:e.id,tag:'Epa!'}];
      const count=(previous.get(k) ?? 0)+1;
      previous.set(k,count);
      if (count===3 && ['home','back','history','latest'].includes(e.action)) return [{at:e.id,tag:'Cadê?'}];
    }
    return [];
  });
}

