# UX-Agent · P3 de Interação Humano-Computador

Lucas Cerqueira Portela e Bruno Prado dos Santos · Engenharia de Computação · CEFET-MG, Campus Divinópolis

Aplicativo acadêmico de lembretes e registros fictícios. O agente recebe os sinais visíveis da interface, escolhe uma ação permitida por turno e tem o resultado conferido por um verificador independente.

## Como avaliar localmente

É necessário Node.js 22 ou posterior. O projeto usa apenas bibliotecas nativas do Node.js.

```sh
git clone https://github.com/ByBrun0/IHC-Bruno-Lucas.git
cd IHC-Bruno-Lucas
npm test
npm start
```

Abra http://127.0.0.1:3000 e selecione C2 ou C4 e a variante A ou B. O aplicativo mostra o registro da tentativa após o encerramento. No Windows, se o PowerShell bloquear o atalho do npm, use `npm.cmd`.

## Execuções e resultados

| Comando | Finalidade |
| --- | --- |
| `npm run technical` | Verifica o sistema com ações dirigidas, sem LLM ou credencial |
| `npm run pilot:codex -- --smoke` | Verifica uma sessão com o Codex autenticado pelo ChatGPT |
| `npm run pilot:codex` | Executa o piloto C2/C4 com o Codex, sem chave da API |
| `npm run pilot` | Alternativa via OpenAI API com credencial própria e faturamento separado |

Para executar pelo Codex, instale a CLI oficial, autentique-se com sua conta ChatGPT e confira o login com `codex login status`. O modo usa a franquia da conta autenticada. Pode-se fixar o modelo com a variável `UXAGENT_MODEL`. O modo Codex só usa a observação e a lista de ações no turno, com saída estruturada e sessões independentes. A P3 rejeita ações fora das opções válidas e resultados que envolvam ferramentas da CLI.

A rodada completa usa quatro sequências contrabalançadas, duas repetições por sequência, para referência fixa e controle neutro. As sementes são 20261026–20261033 por configuração. Apenas C2 e C4 estão disponíveis para execução. O controle neutro serve à comparação técnica; a configuração amostrada está disponível no motor como modo exploratório.

Os registros locais ficam em `results/technical`, `results/codex` ou `results/api`. Consulte o [dicionário dos eventos](DICIONARIO_EVENTOS.md). A publicação inicial contém o código e os testes locais. O piloto real com o Codex está pendente. O caderno de design, o artigo, os registros do piloto e a demonstração integram os entregáveis separados da P3.

## Organização do código

| Caminho | Função |
| --- | --- |
| `public/` | Interface interativa no navegador |
| `src/engine.mjs` e `src/transitions.json` | Máquina de estados, observação, mecanismos M1–M4, eventos e verificação de sucesso |
| `src/scenarios/` e `src/evaluator/` | Cenários C2/C4 e regras privadas usadas pelo verificador |
| `src/pilot.mjs` e `src/codex-provider.mjs` | Execução do piloto e integração pelo login do ChatGPT |
| `test/` | Testes locais de fluxo, isolamento da observação e verificação |

As memórias de observação e de navegação reiniciam a cada tentativa. O repertório M4 é preservado entre as duas tentativas da mesma sessão. A lista de ações tem identificadores descartáveis e a observação exclui os critérios do avaliador e os modelos de análise de tarefas. O piloto limita cada tentativa a 40 ações ou 60 propostas e encerra por falha técnica após três propostas inválidas consecutivas. Os resultados da verificação dirigida ajudam a testar o instrumento.
