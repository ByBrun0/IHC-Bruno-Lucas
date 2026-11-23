import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { askCodex } from './codex-provider.mjs';
import { createSession, startTask, observe, execute, finish, closeSession, VERSION } from './engine.mjs';

const model = 'gpt-6-sol';
const effort = 'medium';
const maxCalls = 60;
const id = 'c2-medio-' + randomUUID();
const folder = new URL('../results/medio/', import.meta.url);
await mkdir(folder, { recursive: true });
const file = new URL(id + '.json', folder);
const prompt = (await readFile(new URL('./prompt.txt', import.meta.url), 'utf8')).trim();
const session = createSession({id, mode: 'fixed', seed: 20261026, origin: 'synthetic_llm'});
const requests = [];
startTask(session, 'C2', 'B');
const save = status => writeFile(file, JSON.stringify({
  id, version: VERSION, model, effort, maxCalls, status, task: 'C2', variant: 'B',
  events: session.events, requests, result: session.attempt.result ?? null,
}, null, 2));
await save('started');
for (let turn = 0; turn < maxCalls && !session.attempt.result; turn++) {
  const observation = observe(session);
  const answer = await askCodex(observation, prompt, model, effort);
  requests.push({turn, ...answer});
  if (answer.failed) finish(session, 'technical');
  else execute(session, answer.action);
  await save('started');
  console.log('Turno', turn + 1, answer.failed ? 'falha técnica' : 'registrado');
}
if (!session.attempt.result) finish(session, 'limit');
closeSession(session);
await save('closed');
console.log(file.pathname, JSON.stringify(session.attempt.result));

