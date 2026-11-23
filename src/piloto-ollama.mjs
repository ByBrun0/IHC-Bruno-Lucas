import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createSession, startTask, observe, execute, finish, closeSession, VERSION } from './engine.mjs';

const model = 'qwen3:4b-instruct-2507-q4_K_M';
const host = 'http://127.0.0.1:11434';
const plans = [{ task: 'C4', maxCalls: 5 }, { task: 'C2', maxCalls: 12 }];
const folder = new URL('../results/ollama/', import.meta.url);
await mkdir(folder, { recursive: true });
const prompt = (await readFile(new URL('./prompt.txt', import.meta.url), 'utf8')).trim();
const listed = await fetch(host + '/api/tags', { signal: AbortSignal.timeout(5000) });
const installed = (await listed.json()).models.find(entry => entry.name === model);
if (!installed) throw new Error('Modelo local não encontrado: ' + model);

for (const { task, maxCalls } of plans) {
  const id = 'ollama-' + task.toLowerCase() + '-' + randomUUID();
  const file = new URL(id + '.json', folder);
  const session = createSession({ id, mode: 'fixed', seed: 20261026, origin: 'synthetic_llm' });
  const requests = [];
  startTask(session, task, 'B');
  const save = status => writeFile(file, JSON.stringify({
    id, version: VERSION, model, digest: installed.digest, maxCalls, status, task, variant: 'B',
    events: session.events, requests, result: session.attempt.result ?? null,
  }, null, 2));
  await save('started');
  for (let turn = 0; turn < maxCalls && !session.attempt.result; turn++) {
    const observation = observe(session);
    const request = {
      model, system: prompt, prompt: JSON.stringify(observation), stream: false,
      options: { temperature: 0, num_ctx: 2048, num_predict: 128, seed: 20261026 },
      format: {
        type: 'object', additionalProperties: false, required: ['observation_id', 'action_id', 'arguments'],
        properties: {
          observation_id: { type: 'string', enum: [observation.observation_id] },
          action_id: { type: 'string', enum: observation.allowed_actions.map(option => option.id) },
          arguments: { type: 'object', additionalProperties: false },
        },
      },
    };
    const entry = { turn, request };
    requests.push(entry);
    const started = performance.now();
    try {
      const response = await fetch(host + '/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(45000),
      });
      entry.http_status = response.status;
      entry.response = await response.json();
      if (!response.ok) throw new Error(entry.response.error ?? 'Falha no Ollama');
      let proposal;
      try { proposal = JSON.parse(entry.response.response); } catch { proposal = null; }
      execute(session, proposal);
    } catch (error) {
      entry.error = error.message;
      finish(session, 'technical');
    }
    entry.latency_ms = Math.round(performance.now() - started);
    await save('started');
    console.log(task, 'turno', turn + 1, entry.error ?? 'registrado');
  }
  if (!session.attempt.result) finish(session, 'limit');
  closeSession(session);
  await save('closed');
  console.log(file.pathname, JSON.stringify(session.attempt.result));
  if (session.attempt.result.reason === 'technical') break;
}
