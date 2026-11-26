# Projeto Doe

Aplicação demonstrativa de uma comunidade para doação de roupas. Participantes podem criar uma conta, publicar doações e interagir com as publicações no feed.

## Funcionalidades

- Cadastro, login e logout de participantes.
- Perfil de participação: doador, beneficiário, ambos ou instituição/organizador.
- Feed comunitário com doações e publicações independentes.
- Publicações de texto, com foto opcional, para divulgar atividades e ações solidárias sem cadastrar uma roupa.
- Cadastro de roupas com categoria, tamanho, condição, descrição e foto obrigatória.
- Perfil **Instituição/Organizador**, com opção de associar uma data às publicações e divulgá-las no calendário mensal da comunidade.
- Calendário mensal para consultar as atividades organizadas por data.
- Painel pessoal com um resumo das doações da conta.
- Curtidas e comentários nas publicações.
- Opção para seguir e deixar de seguir participantes.
- Filtro do feed para ver todas as publicações ou somente as pessoas seguidas.
- Conversas privadas persistentes entre participantes, acessíveis pelo feed ou pela área **Mensagens**.
- Sino de avisos acima do avatar, com a contagem de mensagens não lidas.
- Foto de perfil atualizável pelo avatar fixo no canto inferior esquerdo, exibida no feed e nas conversas.
- Gerenciamento e exclusão das próprias doações.
- Persistência local no arquivo `data.json`.

## Requisitos

- Node.js 20 ou superior.
- npm, incluído com o Node.js.

O projeto não possui dependências npm externas. O Bootstrap e a fonte usados na interface são carregados por CDN, então esses recursos precisam de conexão com a internet.

## Como executar

No terminal, a partir da pasta do projeto:

```bash
npm start
```

O servidor inicia em `http://localhost:3000`. Abra esse endereço no navegador; não abra o arquivo `index.html` diretamente, pois o frontend utiliza a API do servidor.

Para usar outra porta:

```powershell
$env:PORT=3001
npm start
```

Em macOS ou Linux:

```bash
PORT=3001 npm start
```

## Como usar

1. Abra a aplicação e crie uma conta na opção **Cadastre-se**.
2. No feed, use **Nova doação** para publicar uma peça.
3. Use **Seguir** em uma publicação para acompanhar aquele participante. A aba **Seguindo** mostra as publicações de quem você segue.
4. Use **Fazer publicação** no feed para compartilhar um texto e, se quiser, uma foto; não é necessário cadastrar uma roupa.
5. Use **Mensagem** em uma publicação ou abra **Mensagens** para iniciar uma conversa privada. O sino acima do avatar indica mensagens não lidas; abrir a conversa marca as mensagens recebidas como lidas.
6. Acesse **Painel** pela navegação para ver o resumo da conta. Curta ou comente publicações e doações; para gerenciar suas peças, acesse **Cadastrar**. Use **Sair** na navegação ou **Sair da conta** no painel para encerrar a sessão.
7. Para testar com outra conta, encerre a sessão e crie ou acesse uma segunda conta no mesmo servidor.
8. Clique no avatar fixo no canto inferior esquerdo para escolher ou alterar sua foto de perfil. São aceitas imagens PNG, JPG ou WebP de até 2 MB; sem foto, o avatar mostra as iniciais.
9. Ao criar uma conta, escolha **Instituição/Organizador** para publicar atividades com data. Usuários autenticados podem consultar as atividades no **Calendário** e selecionar um dia para ver os detalhes.

## Persistência dos dados

O servidor lê e grava usuários, sessões, doações, publicações, curtidas, comentários, relações de quem cada participante segue e mensagens privadas com seu estado de leitura em `data.json`. Esse arquivo é criado na pasta do projeto e seus dados permanecem após reiniciar o servidor.

Faça uma cópia de segurança de `data.json` antes de removê-lo ou substituí-lo. Apagar esse arquivo reinicializa os dados da aplicação. Como ele pode conter informações de contas e publicações, não compartilhe nem publique uma cópia preenchida com dados reais.

Se `data.json` existir, mas estiver inválido ou inacessível, o servidor encerra a inicialização com uma mensagem de erro em vez de iniciar com um banco vazio e sobrescrever os dados.

## Publicar na Vercel

Na Vercel não é possível gravar o `data.json`, então os dados ficam em um banco Redis (Upstash). Localmente nada muda: sem as variáveis do Redis, o projeto continua usando o `data.json`.

1. No painel da Vercel, use **Add New → Project** e importe este repositório do GitHub. Não é preciso alterar nenhuma configuração de build.
2. No projeto criado, abra **Storage**, crie um banco **Upstash for Redis** (o plano gratuito é suficiente) e conecte-o ao projeto. A Vercel cria as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` (o projeto também aceita `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`). Se o painel pedir um prefixo para as variáveis, deixe o padrão.
3. Faça um novo deploy (**Deployments → Redeploy**) para que a função passe a usar essas variáveis.

O banco começa vazio: as contas e doações do `data.json` local não são enviadas. Para testar o projeto localmente usando o mesmo banco, defina as mesmas variáveis antes do `npm start`.

### Dados de demonstração

`npm run seed:demo` cria seis contas fictícias (instituição, doadores e beneficiários), doações em todas as situações, publicações, atividades no calendário, conversas e notificações. Todas as contas usam a senha `demo1234`, por exemplo `ana@example.com` ou `instituto@example.com`.

- Sem variáveis do Redis, os dados vão para o `data.json` local.
- Para preencher o banco da Vercel, copie `KV_REST_API_URL` e `KV_REST_API_TOKEN` da aba **Storage** do projeto (em **.env.local**) e rode no PowerShell:

  ```powershell
  $env:KV_REST_API_URL="https://..."
  $env:KV_REST_API_TOKEN="..."
  npm run seed:demo
  ```

O script só preenche um banco vazio. Para apagar tudo e criar os dados de novo, use `npm run seed:demo -- --force`; no `data.json` local, uma cópia de segurança (`data.backup-*.json`) é salva antes.

Como funciona a publicação:

- A Vercel reconhece o `server.js` e publica o projeto como um servidor Node, o mesmo usado localmente: ele atende a API e entrega `index.html`, `css/style.css` e `js/app.js`. Nenhum outro arquivo da pasta é público.
- Na Vercel, o servidor só inclui no pacote os arquivos citados pelo código. Por isso `src/server.js` lista os arquivos públicos com caminhos fixos; um arquivo público novo precisa ser acrescentado a essa lista.
- Sem o Redis configurado, a API responde avisando que falta conectar o banco.
- O `.vercelignore` impede que `data.json` e outros arquivos locais sejam enviados em um deploy feito pelo terminal.

## API principal

As rotas abaixo são atendidas pelo servidor Node.js. As rotas de publicação, curtida, comentário, seguir, mensagens e exclusão exigem uma sessão, criada por cookie HTTP. Cadastro e login criam essa sessão.

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/me` | Retorna o participante da sessão atual, ou `null`. |
| `POST` | `/api/auth/register` | Cria uma conta e inicia uma sessão. |
| `POST` | `/api/auth/login` | Inicia uma sessão. |
| `POST` | `/api/auth/logout` | Encerra a sessão atual. |
| `PUT` | `/api/auth/avatar` | Atualiza a foto de perfil da sessão atual. |
| `GET` | `/api/users/:id/avatar` | Retorna a foto de perfil de um participante autenticado. |
| `GET` | `/api/events?month=AAAA-MM` | Lista as atividades marcadas para o mês indicado. |
| `GET` | `/api/feed` | Lista as doações e publicações da comunidade. |
| `GET` | `/api/feed?filter=following` | Lista as publicações das pessoas seguidas pela conta atual. |
| `POST` | `/api/donations` | Publica uma doação. |
| `DELETE` | `/api/donations/:id` | Exclui uma doação própria. |
| `POST` | `/api/posts` | Cria uma publicação de texto com foto opcional. |
| `DELETE` | `/api/posts/:id` | Exclui uma publicação própria. |
| `POST` | `/api/posts/:id/like` | Alterna a curtida em uma publicação. |
| `POST` | `/api/posts/:id/comments` | Adiciona comentário a uma publicação. |
| `POST` | `/api/donations/:id/like` | Alterna a curtida em uma doação. |
| `POST` | `/api/donations/:id/comments` | Adiciona comentário a uma doação. |
| `POST` | `/api/users/:id/follow` | Alterna entre seguir e deixar de seguir um participante. |
| `GET` | `/api/conversations` | Lista os participantes, a prévia da última mensagem e a contagem de mensagens não lidas. |
| `GET` | `/api/conversations/:id/messages` | Lista as mensagens trocadas com um participante e marca as recebidas como lidas. |
| `POST` | `/api/conversations/:id/messages` | Envia uma mensagem de até 1000 caracteres. |

As rotas `POST` que recebem dados usam JSON. Por exemplo, para cadastrar uma doação:

```json
{
  "name": "Casaco de lã",
  "category": "Casacos",
  "size": "M",
  "condition": "Boa",
  "description": "Em bom estado",
  "image": ""
}
```

## Estrutura do projeto

```text
.
├── src/
│   ├── controllers/       # entrada e resposta HTTP por funcionalidade
│   ├── middleware/        # sessão e usuário autenticado
│   ├── repositories/      # leitura e gravação do JSON
│   ├── routes/            # mapeamento de método e rota para controllers
│   ├── services/          # autenticação, feed, doações, publicações e mensagens
│   ├── utils/             # HTTP, erros e serialização
│   └── server.js          # servidor HTTP e arquivos públicos
├── css/
│   └── style.css          # estilos da interface
├── js/
│   └── app.js             # navegação, feed, mensagens e chamadas à API
├── data.json              # persistência local
├── index.html             # páginas da aplicação
├── package.json           # comando de inicialização
└── server.js              # inicialização da aplicação
```

As requisições seguem o fluxo **rota → controller → service → repositório**. Para adicionar uma nova funcionalidade, crie suas regras no service e exponha as operações necessárias pelo controller e pelas rotas. A persistência atual usa JSON e pode ser substituída pelo repositório sem colocar acesso a arquivos nos controllers.

Não há classes de entidade artificiais: os dados são objetos simples e as regras ficam nos services. Se entidades passarem a ter invariantes ou comportamentos próprios, elas podem ser introduzidas no domínio conforme a necessidade.

## Limitações

Este projeto é uma demonstração acadêmica: o armazenamento em arquivo JSON atende a um uso local e pequeno, mas não oferece as garantias de concorrência, escalabilidade ou disponibilidade de um banco de dados e hospedagem de produção. Para disponibilizá-lo a várias pessoas pela internet, configure hospedagem, HTTPS, armazenamento adequado, backups e controles de segurança adicionais.
