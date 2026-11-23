import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function askCodex(observation, instructions, model, effort = null) {
  const schema = {
    type: 'object', additionalProperties: false, required: ['observation_id', 'action_id', 'arguments'],
    properties: {
      observation_id: { type: 'string', enum: [observation.observation_id] },
      action_id: { type: 'string', enum: observation.allowed_actions.map(option => option.id) },
      arguments: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    },
  };
  const input = instructions + '\nEscolha somente um ID da observação. Não use ferramentas.\n' + JSON.stringify(observation);
  const request = { effort, provider: 'codex_chatgpt', model, input, schema };
  const folder = await mkdtemp(join(tmpdir(), 'uxagent-turn-'));
  try {
    await writeFile(join(folder, 'schema.json'), JSON.stringify(schema));
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
      if (['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_API_KEY'].includes(name.toUpperCase())) delete env[name];
    }
    const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
      '--disable', 'shell_tool', '-c', 'web_search="disabled"', '-c', 'forced_login_method="chatgpt"',
      '--json', '--output-schema', join(folder, 'schema.json')];
    if (model) args.push('--model', model);
    if (effort) args.push('-c', 'model_reasoning_effort=' + JSON.stringify(effort));
    args.push('-');
    const started = performance.now();
    const run = await new Promise(resolve => {
      const proc = spawn('codex', args, { cwd: folder, env, windowsHide: true, timeout: 90000 });
      let data = '', errors = '';
      proc.stdout.setEncoding('utf8').on('data', chunk => { data += chunk; });
      proc.stderr.setEncoding('utf8').on('data', chunk => { errors += chunk; });
      proc.stdin.on('error', () => {});
      proc.on('error', error => resolve({ code: null, data, errors: error.code }));
      proc.on('close', code => resolve({ code, data, errors }));
      proc.stdin.end(input, 'utf8');
    });
    const events = run.data.split(/\r?\n/).filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return {}; }
    });
    const completed = events.findLast(event => event.type === 'turn.completed');
    const calledTools = events.some(event => event.item && !['agent_message', 'reasoning'].includes(event.item.type));
    const output = events.findLast(event => event.type === 'item.completed' && event.item?.type === 'agent_message')?.item.text;
    const calls = [{ status: run.code, latency_ms: Math.round(performance.now() - started), usage: completed?.usage ?? null }];
    if (run.code !== 0 || !completed || calledTools || !output) {
      const detail = calledTools ? 'A rodada tentou acessar ferramentas.' :
        events.findLast(event => event.type === 'error')?.message ?? run.errors?.trim().split(/\r?\n/).at(-1);
      console.error('Falha no Codex:', detail || 'sem resposta final');
      return { request, calls, failed: true };
    }
    let action;
    try { action = JSON.parse(output); } catch { action = null; }
    return { request, calls, action, output_text: output };
  } finally {
    await rm(join(folder, 'schema.json'), { force: true });
    await rmdir(folder).catch(() => {});
  }
}

