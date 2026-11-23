# UX-Agent para lembretes de medicamentos

Trabalho de IHC de Lucas Cerqueira Portela e Bruno Prado dos Santos, CEFET-MG, Campus Divinópolis.

Neste projeto, fizemos um protótipo para consultar lembretes e registros fictícios. Usamos uma IA para escolher entre as ações que aparecem na tela e registramos cada passo. O aplicativo confere o resultado da tarefa com base nas consultas feitas e na resposta registrada.

## Arquivos da entrega

- [Relatório e caderno de design](entrega/Relatorio_P3_Com_Anexo_E1.pdf)
- [Dados e instruções de leitura dos registros](entrega/E3_Logs_Piloto_Codex.zip)
- [Vídeo de uma execução registrada](entrega/E5_Demonstracao_Piloto_Codex.mp4)

## Como abrir o protótipo

Clone este repositório. Com Node.js 22 ou superior, execute `npm start` na pasta do projeto e abra http://127.0.0.1:3000. Escolha a tarefa C2 ou C4 e a variante A ou B. Ao concluir, abra o registro da tentativa na própria página. Essa execução manual funciona sem conta ou chave. No PowerShell, use `npm.cmd` se o comando `npm` estiver bloqueado.

A interface fica em `public/`. O código das tarefas, das regras do agente e da conferência fica em `src/`. Para rodar os testes locais da pasta `test/`, use `npm test`.

## Como repetir o piloto

Usamos o Codex CLI com login do ChatGPT. Para repetir, autentique a CLI, confira com `codex login status` e use `npm run pilot:codex -- --smoke` para uma sessão curta. `npm run pilot:codex` segue o plano original e pode consumir mais franquia. `npm run pilot` usa a API com chave própria e cobrança separada. `npm run technical` executa a verificação dirigida local.

O piloto usou as tarefas C2 e C4. As sementes previstas são 20261026 a 20261033 por configuração. O perfil fixo usa q=0,35, k=1, a=1 e l=5. A opção neutra de comparação roda com os mecanismos desativados e mantém a ajuda disponível. O comando de piloto inclui os dois modos. É possível indicar o modelo com `UXAGENT_MODEL`. Os novos registros ficam em `results/` e os campos estão descritos no [dicionário de eventos](DICIONARIO_EVENTOS.md).

Encerramos a coleta após 9 sessões, com 17 tentativas. Houve 8 sucessos, 8 insucessos e um desfecho desconhecido por falha técnica. Como só uma sessão foi neutra, usamos os dados para discutir o funcionamento do protótipo.

## Interface 1.1

Esta versão apresenta a revisão visual do aplicativo. As instruções, os atalhos de navegação, o cartão do medicamento e o campo de resposta aparecem em áreas próprias. Para abrir a revisão, use as instruções de execução acima.

A pasta [revisao-visual](revisao-visual/) contém as telas, o complemento de design e o vídeo de uma verificação dirigida no navegador. Os dados e o vídeo em entrega/ correspondem ao piloto da interface anterior, preservado na branch main.

A revisão 1.2 simplifica a ajuda e a instrução de C4. Fizemos uma tentativa curta com Luna e limite de cinco chamadas. O agente atingiu o limite sem responder. Os dados estão em revisao-visual. Para repetir essa tentativa, use node src/piloto-curto.mjs com o Codex CLI autenticado. Cada execução faz até cinco chamadas e usa a franquia da conta.

Para repetir as duas tentativas locais, inicie o Ollama com o modelo qwen3:4b-instruct-2507-q4_K_M instalado e execute node src/piloto-ollama.mjs. O script usa apenas o serviço local e limita C4 a cinco chamadas e C2 a doze. Os resultados da rodada estão em revisao-visual/Dados_Ollama_Interface_1_2.zip.
