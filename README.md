# BlackFit

App web instalável com central administrativa e contas individuais de alunos. Mantém o estilo escuro e azul do HTML enviado, preservado em `original.html`. O administrador cadastra alunos, escreve dietas e treinos individuais, define metas de água, acompanha o histórico, pausa acessos e redefine senhas. Cada aluno troca a senha inicial e abre a interface do HTML original: checklist de exercícios, cargas por série, botões e copos de água, calorias/refeições, desafio de 120 dias sem açúcar, metas diárias, peso com gráfico, fotos e calendário. O estado e as metas são salvos no banco por conta, sem reutilizar dados locais de outro aluno. A central vê água, peso, exercícios concluídos e dias sem doce. Os planos são editados em texto; no treino, use títulos “Treino A”, “Treino B” e linhas como `Supino | 3 | 12 | 60s | Peito`; para dieta, uma refeição por linha como `Café da manhã | 350`. Sem personalização, o aluno vê o modelo original enviado. A distribuição dos treinos personalizados alterna os grupos de segunda a sábado, com domingo de cardio/descanso; instruções adicionais podem ser colocadas nas orientações.

## Publicar na Vercel

1. Coloque estes arquivos na raiz do repositório `Sistema` no GitHub e importe esse repositório na Vercel. A configuração `vercel.json` encaminha as rotas para a aplicação Flask, inclusive a API e os arquivos do app. Não selecione um preset de site estático, nem publique somente o HTML. Não é necessário um comando de build JavaScript.
2. No projeto da Vercel, crie/conecte um banco PostgreSQL persistente, por exemplo **Neon**, pela área de Storage/Marketplace.
3. Em **Settings → Environment Variables**, configure `DATABASE_URL` com a URL PostgreSQL fornecida pelo banco. Caso a integração tenha criado apenas `POSTGRES_URL`, adicione também `DATABASE_URL` com a conexão correspondente. Insira o valor somente no painel seguro. Não envie essa URL no chat nem coloque no Git. A conexão externa usa TLS com verificação do certificado e hostname, usando o pacote `certifi` com as raízes confiáveis da Mozilla, incluído nas dependências, sem depender dos certificados do sistema da Vercel. O Neon oferece certificados públicos compatíveis. `PGSSLROOTCERT` pode indicar um arquivo de CA confiável em instalações que precisem de certificados próprios; a verificação completa permanece obrigatória.
4. Configure `BOOTSTRAP_TOKEN` com um código aleatório privado de pelo menos **32 caracteres**, criado por você, por exemplo em um gerenciador de senhas. Ele libera a criação da sua primeira conta administrativa. Não é a senha dos alunos e não é uma chave para distribuir.
5. Faça o deploy/redeploy após adicionar as variáveis. A aplicação cria as tabelas no banco automaticamente. Na Vercel, cookies seguros são ativados automaticamente.
6. Abra o endereço HTTPS, expanda **Ativar minha central**, informe seu nome, e-mail, senha e código de ativação. Depois entre na sua conta. Só é possível criar um administrador por esse fluxo. Após ativar, remova `BOOTSTRAP_TOKEN` das variáveis da Vercel e faça um redeploy; os próximos logins não dependem dele.
7. Cadastre os alunos, prepare os planos e envie o link e o acesso inicial de cada pessoa por um canal privado. O aluno muda sua senha no primeiro login.

O PostgreSQL guarda planos, progresso, sessões e limites de tentativas de login; uma nova função da Vercel não perde esses dados. Configure backups no provedor do banco. Para deployments de preview, use um banco separado dos dados reais. O deploy público, o acesso à sua conta Vercel/Neon e a conexão com o seu banco ainda precisam ser validados depois da configuração no painel.

## Ícone e instalação no celular

O nome instalado é **BlackFit**. O logo usa um halter azul com um raio sobre fundo preto. Há ícones PNG 192/512 px para Android e 180 px para iPhone, com manifest e service worker. Após publicar em HTTPS, escolha **Instalar app** no navegador. No iPhone, use Safari → Compartilhar → Adicionar à Tela de Início. Essa versão é uma PWA; não depende de loja. A instalação efetiva em Android/iPhone precisa ser conferida nos aparelhos após o deploy. Os planos e o salvamento precisam de internet; dados pessoais não são guardados no cache offline.

## Desenvolvimento na nuvem

Use o checkout existente e isolado em `/workspace/Sistema`, sem criar worktrees.

```bash
cd /workspace/Sistema
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest -v
.venv/bin/flask --app 'app:create_app()' create-admin
.venv/bin/gunicorn --workers 1 --threads 4 --bind 127.0.0.1:8001 'app:create_app()'
```

Sem `DATABASE_URL`, a execução local usa SQLite em `instance/sistema.sqlite3`; ele fica fora do Git. O comando `create-admin` pede os dados e oculta a senha. Execute uma vez no banco desejado, sem contas padrão. Não use o servidor estático `python -m http.server`, que não executa a API e exporia arquivos privados. O HTML original é uma referência de design e não é servido pelo backend.

Com `DATABASE_URL` presente, o backend usa PostgreSQL. Na Vercel, a ausência dessa variável impede a inicialização, em vez de salvar dados em arquivos temporários. Não execute os testes destrutivos com um banco real de alunos.

## Testes

`python -m unittest -v` verifica autenticação, separação de contas, atribuição de planos, progresso, persistência após reiniciar, troca/redefinição de senha, revogação, CSRF, limitação de tentativas, proteção de arquivos e ativos de instalação.

Para executar a mesma suíte contra um PostgreSQL **descartável de teste**, defina `TEST_POSTGRES_URL` na sessão antes do comando. A suíte recria o schema `public`; nunca use uma URL de produção. Também foi validado o fluxo visual com Chromium em larguras desktop e celular. As contas dos testes são temporárias e não são criadas no banco de desenvolvimento.

O `Dockerfile` é uma alternativa opcional de hospedagem fora da Vercel. Para SQLite em container, monte um volume permanente em `/data`; para PostgreSQL, forneça `DATABASE_URL`. Use HTTPS e backups em produção.

## Interface original e sincronização

`student.html`, `student-core.js` e `student-pro.js` preservam a interface e as rotinas do HTML original. `student-bridge.js` liga o estado à API autenticada. Chart.js 4.4.1 está incluído em `vendor/`, com licença, e o download foi verificado contra a integridade do registro npm. Nenhum script Firebase/CDN é necessário.

O aluno entra pela rota `/aluno`. Dados anteriores de peso/água são importados quando ainda não existe um estado completo. As alterações são enviadas à nuvem em sequência, com controle de versão para detectar conflitos entre abas. O indicador mostra confirmação, falha ou alterações pendentes. É preciso manter a página aberta até confirmar o salvamento; alterações offline ficam apenas na memória desta sessão. Fotos comprimidas fazem parte do estado e o histórico completo tem limite de 4 MB por salvamento. O logout e os avisos de saída sinalizam alterações ainda não salvas.

A política de segurança da tela do aluno permite os estilos e manipuladores inline do HTML original; as páginas de login/admin mantêm a política mais restrita. A API continua exigindo autenticação, papel, CSRF e isolamento por conta. Fotos aceitam apenas imagens base64, e os dados de bootstrap são escapados para impedir a quebra do bloco JSON.
