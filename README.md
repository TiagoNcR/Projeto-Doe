# Projeto Doe

Aplicação demonstrativa de uma comunidade para doação de roupas. Participantes podem criar uma conta, publicar doações e interagir com as publicações no feed.

## Funcionalidades

- Cadastro, login e logout de participantes.
- Perfil de participação: doador, beneficiário ou ambos.
- Feed comunitário com doações e publicações independentes.
- Publicações de texto, com foto opcional, para divulgar atividades e ações solidárias sem cadastrar uma roupa.
- Cadastro de roupas com categoria, tamanho, condição, descrição e foto opcional.
- Curtidas e comentários nas publicações.
- Opção para seguir e deixar de seguir participantes.
- Filtro do feed para ver todas as publicações ou somente as pessoas seguidas.
- Conversas privadas persistentes entre participantes, acessíveis pelo feed ou pela área **Mensagens**.
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
5. Use **Mensagem** em uma publicação ou abra **Mensagens** para iniciar uma conversa privada. As mensagens novas são verificadas periodicamente enquanto a área está aberta.
6. Curta ou comente publicações e doações. Para gerenciar suas peças, acesse **Cadastrar**. Use **Sair** na navegação ou **Sair da conta** no painel para encerrar a sessão.
7. Para testar com outra conta, encerre a sessão e crie ou acesse uma segunda conta no mesmo servidor.

## Persistência dos dados

O servidor lê e grava usuários, sessões, doações, publicações, curtidas, comentários, relações de quem cada participante segue e mensagens privadas em `data.json`. Esse arquivo é criado na pasta do projeto e seus dados permanecem após reiniciar o servidor.

Faça uma cópia de segurança de `data.json` antes de removê-lo ou substituí-lo. Apagar esse arquivo reinicializa os dados da aplicação. Como ele pode conter informações de contas e publicações, não compartilhe nem publique uma cópia preenchida com dados reais.

## API principal

As rotas abaixo são atendidas pelo servidor Node.js. As rotas de publicação, curtida, comentário, seguir, mensagens e exclusão exigem uma sessão, criada por cookie HTTP. Cadastro e login criam essa sessão.

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/me` | Retorna o participante da sessão atual, ou `null`. |
| `POST` | `/api/auth/register` | Cria uma conta e inicia uma sessão. |
| `POST` | `/api/auth/login` | Inicia uma sessão. |
| `POST` | `/api/auth/logout` | Encerra a sessão atual. |
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
| `GET` | `/api/conversations` | Lista os participantes e a prévia da última mensagem de cada conversa. |
| `GET` | `/api/conversations/:id/messages` | Lista as mensagens trocadas com um participante. |
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
