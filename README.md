# UX-Agent de IHC · P3

Implementação acadêmica do aplicativo fictício de lembretes e registros. Requer Node.js 22 ou posterior. Usa apenas bibliotecas nativas.

| Objetivo | Comando |
|---|---|
| Interface web | `npm start`, depois abrir http://127.0.0.1:3000 |
| Verificação automatizada | `npm test` |
| Verificação local com ações dirigidas | `npm run technical` |
| Piloto com LLM | `npm run pilot`, após configurar a variável de ambiente `OPENAI_API_KEY` com acesso autorizado |

O servidor serve apenas em loopback. O piloto roda C2/C4 em quatro sequências contrabalançadas, duas repetições por sequência, para referência fixa e controle neutro. As sementes são 20261026–20261033 por configuração. Variável opcional `UXAGENT_MODEL` seleciona o modelo; o padrão é `gpt-6-luna`. A configuração amostrada está disponível no motor por `createSession({id, mode:'sampled', seed})`. É um modo exploratório, fora do piloto principal. O controle neutro é contraste técnico. Cada rodada gera uma subpasta em `results/technical` ou `results/api`. Confira erros de API e versão do modelo antes de interpretar resultados.

Entre tentativas, preserva-se apenas o repertório M4. As memórias de observação e de marcos recomeçam. Nenhum identificador interno de ocorrência, solução privada ou modelo do analista entra na observação. Os identificadores opacos são descartados no próximo turno; o executor apenas aceita opções da observação correspondente. O texto fixo veio da A2. O painel de auditoria é exibido após o encerramento.

## Dados e validação

O modo técnico usa ações dirigidas, sem modelo ou participantes. As duas tarefas reservadas permanecem sob custódia da A2 e estão fora dos cenários executáveis deste pacote. A API recebe somente dados fictícios. Privilégios da chave ficam na variável de ambiente; os registros preservam o corpo enviado, a latência e o identificador de resposta disponível sem copiar o cabeçalho de autorização.

Consulte `DICIONARIO_EVENTOS.md` para auditoria. Os limites são de 40 ações e 60 propostas por tentativa; três propostas inválidas consecutivas encerram com falha técnica. O relatório separa latência computacional da referência analítica de usuário experiente.

