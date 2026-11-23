const $ = selector => document.querySelector(selector);
let sessionId;
let busy = false;
let answerActions = [];
let observationId;

async function post(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

async function run(operation) {
  if (busy) return;
  busy = true;
  $('#error').textContent = '';
  try { await operation(); }
  catch (error) { $('#error').textContent = error.message; }
  finally { busy = false; }
}

function element(tag, text, className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

function occurrence(label) {
  const match = /^Item (.+) · (\d{2}:\d{2}) · (\d{2}\/\d{2}\/\d{4})$/.exec(label);
  if (!match) return null;
  const [, name, time, date] = match;
  return [element('span', 'Item ' + name, 'occurrence-name'), element('small', time + ' · ' + date)];
}

function render(observation) {
  observationId = observation.observation_id;
  $('#setup').hidden = true;
  $('#attempt').hidden = false;
  $('#audit').hidden = true;
  $('#restart').hidden = true;
  $('#instruction').textContent = observation.instruction;
  $('#heading').textContent = observation.heading;

  const selected = observation.content.find(line => line.startsWith('Resposta selecionada: '));
  $('#content').replaceChildren(...observation.content.filter(line => line !== selected).map(line => {
    const item = occurrence(line);
    if (item) {
      const block = element('p', '');
      block.append(...item);
      return block;
    }
    if (/^(Sem confirmação registrada|Pendente|Tomada relatada às|Salvo)/.test(line)) {
      return element('p', line, /^Tomada relatada|^Salvo/.test(line) ? 'status reported' : 'status');
    }
    return element('p', line);
  }));

  const nav = $('#navigation');
  const actions = $('#actions');
  const controls = $('#outcome-controls');
  for (const region of [nav, actions, controls]) region.replaceChildren();
  answerActions = [];
  for (const action of observation.allowed_actions) {
    const { id, label } = action;
    if (/^Alfa: | · Ingestão: /.test(label)) {
      answerActions.push(action);
      continue;
    }
    const item = occurrence(label);
    const navigation = /^(Início|Hist\.|Ver histórico|Último|Ver último registro|Ajuda)$/.test(label);
    const ending = label === 'Concluir' || label === 'Desistir';
    const prominent = /^(OK|Registrar que tomei|Confirmar correção|Voltar à tarefa)$/.test(label);
    const style = item ? 'occurrence' : prominent ? 'primary' : label === 'Desistir' ? 'link' : '';
    const button = element('button', label, style);
    button.type = 'button';
    if (item) button.replaceChildren(...item);
    if (label === '✎') button.setAttribute('aria-label', '✎');
    button.addEventListener('click', () => run(() => step(id)));
    (navigation ? nav : ending ? controls : actions).append(button);
  }

  const choice = $('#answer-choice');
  const placeholder = new Option('Escolha uma resposta', '');
  placeholder.disabled = true;
  choice.replaceChildren(placeholder, ...answerActions.map(action => new Option(action.label, action.id)));
  const previous = answerActions.find(action => selected === 'Resposta selecionada: ' + action.label);
  choice.value = previous?.id ?? '';
  $('#selected').textContent = selected ?? '';
  $('#selected').hidden = !selected;
  $('#answer').hidden = answerActions.length === 0;
  nav.hidden = nav.children.length === 0;
  controls.hidden = controls.children.length === 0;
  const finish = [...controls.children].find(button => button.textContent === 'Concluir');
  if (finish) finish.className = selected ? 'primary' : '';
}

async function step(actionId, answering = false) {
  const data = await post('/step', {
    id: sessionId,
    proposal: { observation_id: observationId, action_id: actionId },
  });
  if (data.observation) {
    render(data.observation);
    const finish = $('#outcome-controls .primary');
    (answering && finish ? finish : $('#heading')).focus();
    return;
  }

  const outcomes = { success: 'Tarefa concluída com sucesso.', failure: 'A tarefa terminou sem cumprir todos os critérios.', unknown: 'Não foi possível verificar o resultado.' };
  $('#heading').textContent = 'Tentativa encerrada';
  const feedback = [element('p', outcomes[data.result.status] ?? 'Confira o registro da tentativa.')];
  if (data.result.status === 'failure' && data.result.reason === 'finish') {
    const errors = data.events.filter(event => event.type === 'error_marked').map(event => event.error);
    const reasons = [];
    if (errors.some(error => error.requirement === 'preserve_all')) {
      reasons.push('Esta tarefa pedia apenas consulta. Um registro foi alterado durante a tentativa.');
    }
    if (errors.some(error => error.requirement === 'help')) reasons.push('Faltou abrir a Ajuda, como a tarefa pedia.');
    if (errors.some(error => error.requirement?.startsWith('consult:'))) reasons.push('Faltou consultar um dos registros pedidos.');
    const answered = data.events.some(event => event.type === 'action_executed' && event.action === 'answer');
    if (!answered) reasons.push('Faltou selecionar uma resposta.');
    else if (errors.some(error => error.requirement === 'answer')) reasons.push('Confira se a resposta descreve o registro apresentado na tarefa.');
    feedback.push(...reasons.map(reason => element('p', reason)));
  }
  $('#content').replaceChildren(...feedback);
  $('#actions').replaceChildren();
  for (const selector of ['#navigation', '#answer', '#outcome-controls']) $(selector).hidden = true;
  $('#audit').hidden = false;
  $('#restart').hidden = false;
  $('#events').textContent = JSON.stringify({ resultado: data.result, eventos: data.events }, null, 2);
  $('#heading').focus();
}

$('#setup').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const data = await post('/session', Object.fromEntries(new FormData(event.target)));
    sessionId = data.id;
    render(data.observation);
    $('#heading').focus();
  });
});
$('#answer').addEventListener('submit', event => {
  event.preventDefault();
  run(() => step($('#answer-choice').value, true));
});
$('#restart').addEventListener('click', () => {
  $('#attempt').hidden = true;
  $('#setup').hidden = false;
  $('#setup select').focus();
});
