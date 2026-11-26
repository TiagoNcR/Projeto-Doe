// Preenche o banco com dados fictícios de demonstração.
//
//   npm run seed:demo              só preenche um banco vazio
//   npm run seed:demo -- --force   apaga os dados atuais e preenche de novo
//
// Sem variáveis do Redis, grava no data.json local (com cópia de segurança antes de substituir).
// Com KV_REST_API_URL e KV_REST_API_TOKEN definidas, grava no Redis usado pela Vercel.
//
// Os dados são criados pelos próprios services, então senhas, notificações e mensagens
// automáticas ficam iguais às de um uso real do app.
const fs = require('fs');
const path = require('path');
const repository = require('../src/repositories/jsonRepository');
const authService = require('../src/services/authService');
const donationService = require('../src/services/donationService');
const messageService = require('../src/services/messageService');
const postService = require('../src/services/postService');
const socialService = require('../src/services/socialService');
const { banner, garment } = require('./demo/illustrations');

const DEMO_PASSWORD = 'demo1234';
const HOUR = 60 * 60 * 1000;

const PEOPLE = {
  instituto: { name: 'Instituto Vestir Bem', email: 'instituto@example.com', type: 'Instituição/Organizador' },
  ana: { name: 'Ana Souza', email: 'ana@example.com', type: 'Doador' },
  bruno: { name: 'Bruno Lima', email: 'bruno@example.com', type: 'Beneficiário' },
  carla: { name: 'Carla Mendes', email: 'carla@example.com', type: 'Ambos' },
  diego: { name: 'Diego Rocha', email: 'diego@example.com', type: 'Doador' },
  elisa: { name: 'Elisa Prado', email: 'elisa@example.com', type: 'Beneficiário' }
};

const PALETTES = {
  rosa: { top: '#f7d6e0', bottom: '#e8a5bd', fill: '#fff7fa' },
  verde: { top: '#d8efe4', bottom: '#9fd3bb', fill: '#f7fffb' },
  azul: { top: '#dbe7f7', bottom: '#9db8e3', fill: '#f8fbff' },
  areia: { top: '#f5ead8', bottom: '#dcc29a', fill: '#fffdf8' },
  lilas: { top: '#e6defa', bottom: '#b8a6e8', fill: '#fcfaff' },
  cinza: { top: '#e6e6e6', bottom: '#b9b9c2', fill: '#ffffff' }
};

// Relógio simulado: os services usam `new Date()`, então cada etapa recebe uma data no passado.
function withSimulatedClock(startAt, task) {
  const RealDate = Date;
  let now = startAt;
  class SimulatedDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(now);
    }

    static now() {
      return now;
    }
  }
  const advance = hours => { now += hours * HOUR; };
  global.Date = SimulatedDate;
  try {
    return task(advance);
  } finally {
    global.Date = RealDate;
  }
}

// Datas das atividades contadas a partir de hoje, para que estejam sempre no futuro.
function daysFromToday(days) {
  return new Date(Date.now() + days * 24 * HOUR).toISOString().slice(0, 10);
}

function clearDatabase(database) {
  for (const user of database.users) repository.deleteImage(user.profileImageId);
  for (const item of [...database.donations, ...database.posts]) repository.deleteImage(item.imageId);
  Object.assign(database, {
    users: [], donations: [], posts: [], sessions: [], messages: [], notifications: [], reports: [], images: {}
  });
}

function backupLocalFile() {
  const file = path.join(__dirname, '..', 'data.json');
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(__dirname, '..', `data.backup-${stamp}.json`);
  fs.copyFileSync(file, backup);
  return backup;
}

function createDemoContent(advance, eventDates) {
  const users = {};
  for (const [key, person] of Object.entries(PEOPLE)) {
    users[key] = authService.register({ ...person, password: DEMO_PASSWORD }).user;
    advance(3);
  }
  const { instituto, ana, bruno, carla, diego, elisa } = users;

  const follow = (from, to) => socialService.toggleFollow(from, to.id);
  follow(ana, instituto);
  follow(carla, instituto);
  follow(elisa, instituto);
  follow(bruno, ana);
  follow(diego, ana);
  advance(5);

  const donate = (owner, fields, palette) => {
    const donation = donationService.createDonation(owner, {
      ...fields,
      image: garment(fields.category, PALETTES[palette])
    });
    advance(4);
    return donation;
  };

  const casaco = donate(ana, { name: 'Casaco de lã cinza', category: 'Casacos', size: 'M', condition: 'Muito boa', description: 'Bem quentinho, usei só dois invernos. Sem manchas nem furos.' }, 'cinza');
  const vestido = donate(ana, { name: 'Vestido floral', category: 'Vestidos', size: 'P', condition: 'Boa', description: 'Vestido leve de verão, com alças finas.' }, 'rosa');
  const tenis = donate(ana, { name: 'Tênis de corrida', category: 'Calçados', size: 'Único', condition: 'Boa', description: 'Número 38. A sola ainda está ótima.' }, 'azul');
  const jeans = donate(diego, { name: 'Calça jeans escura', category: 'Calças', size: 'G', condition: 'Boa', description: 'Corte reto, cintura 44.' }, 'azul');
  const kitInfantil = donate(diego, { name: 'Kit de camisetas infantis', category: 'Camisetas', size: 'Infantil', condition: 'Nova', description: 'Cinco camisetas lisas, tamanho 6 anos, ainda com etiqueta.' }, 'verde');
  donate(carla, { name: 'Jaqueta corta-vento', category: 'Casacos', size: 'GG', condition: 'Ok', description: 'Tem um pequeno descosturado no bolso, fácil de arrumar.' }, 'lilas');
  const camisa = donate(carla, { name: 'Camisa social branca', category: 'Camisetas', size: 'M', condition: 'Muito boa', description: 'Ótima para entrevistas de emprego.' }, 'areia');
  donate(instituto, { name: 'Lote de cachecóis e luvas', category: 'Outros', size: 'Único', condition: 'Nova', description: 'Doados por uma malharia parceira. Retirada na sede do instituto.' }, 'verde');

  const mutirao = postService.createPost(instituto, {
    text: 'Mutirão de inverno! Vamos receber e separar roupas na nossa sede, das 9h às 16h. Traga peças limpas e em bom estado.',
    eventDate: eventDates.mutirao,
    image: banner({ top: '#fbe3ec', bottom: '#f3b9cd', dots: [[0.2, 0.3, 60, '#ffffff'], [0.75, 0.25, 40, '#fff2c4'], [0.6, 0.7, 80, '#ffe1ea'], [0.3, 0.78, 35, '#d7f0e4']] })
  });
  advance(6);
  postService.createPost(instituto, {
    text: 'Bazar solidário: tudo a preço simbólico, e a renda vai para a compra de cobertores.',
    eventDate: eventDates.bazar
  });
  advance(8);
  const postAna = postService.createPost(ana, { text: 'Separei várias roupas de inverno para doar esta semana. Quem precisar, é só demonstrar interesse!' });
  advance(5);
  postService.createPost(carla, { text: 'Obrigada a todo mundo que participou do último mutirão. Foram mais de 200 peças arrecadadas!' });
  advance(3);

  donationService.expressInterest(bruno, casaco.id);
  advance(1);
  messageService.sendMessage(ana, bruno.id, { text: 'Oi, Bruno! O casaco ainda está disponível. Você consegue buscar no sábado?' });
  advance(1);
  messageService.sendMessage(bruno, ana.id, { text: 'Consigo sim! Pode ser de manhã?' });
  advance(2);
  donationService.expressInterest(elisa, casaco.id);
  advance(2);
  donationService.updateDonationStatus(ana, casaco.id, { status: 'reserved', reservedFor: bruno.id });
  advance(1);
  messageService.sendMessage(bruno, ana.id, { text: 'Obrigado, Ana! Sábado às 10h na praça da matriz, combinado.' });
  advance(3);

  donationService.expressInterest(elisa, kitInfantil.id);
  advance(2);
  messageService.sendMessage(diego, elisa.id, { text: 'Oi, Elisa! Posso deixar o kit na portaria do instituto amanhã.' });
  advance(1);
  messageService.sendMessage(elisa, diego.id, { text: 'Perfeito, muito obrigada!' });
  donationService.updateDonationStatus(diego, kitInfantil.id, { status: 'reserved', reservedFor: elisa.id });
  advance(20);
  donationService.updateDonationStatus(diego, kitInfantil.id, { status: 'delivered' });
  advance(2);

  donationService.expressInterest(carla, vestido.id);
  advance(1);
  donationService.expressInterest(bruno, jeans.id);
  advance(1);
  donationService.expressInterest(elisa, camisa.id);
  advance(2);

  socialService.toggleLike(bruno, postAna.id, 'post');
  socialService.toggleLike(carla, mutirao.id, 'post');
  socialService.toggleLike(elisa, mutirao.id, 'post');
  socialService.toggleLike(diego, tenis.id, 'donation');
  advance(1);
  socialService.addComment(elisa, mutirao.id, { text: 'Vou levar algumas peças das minhas filhas!' }, 'post');
  advance(1);
  socialService.addComment(diego, tenis.id, { text: 'Que conservado! Alguém do grupo de corrida vai adorar.' }, 'donation');
  advance(1);
  socialService.addComment(carla, postAna.id, { text: 'Que iniciativa linda, Ana!' }, 'post');

  return users;
}

async function seedDemo({ force = false, log = console.log } = {}) {
  if (repository.usesRemoteStore()) await repository.refresh();
  const database = repository.getDatabase();

  if (database.users.length && !force) {
    throw new Error(`O banco já tem ${database.users.length} conta(s). Use --force para apagar tudo e criar os dados de demonstração.`);
  }
  if (database.users.length && !repository.usesRemoteStore()) {
    const backup = backupLocalFile();
    if (backup) log(`Cópia de segurança do data.json salva em ${path.basename(backup)}.`);
  }

  clearDatabase(database);
  const eventDates = { mutirao: daysFromToday(2), bazar: daysFromToday(12) };
  const startAt = Date.now() - 5 * 24 * HOUR;
  withSimulatedClock(startAt, advance => createDemoContent(advance, eventDates));

  // As sessões criadas pelos cadastros não pertencem a ninguém.
  database.sessions = [];
  repository.saveDatabase();
  await repository.flush();

  return {
    users: database.users.length,
    donations: database.donations.length,
    posts: database.posts.length,
    messages: database.messages.length,
    notifications: database.notifications.length
  };
}

if (require.main === module) {
  seedDemo({ force: process.argv.includes('--force') })
    .then(counts => {
      const target = repository.usesRemoteStore() ? 'no Redis' : 'no data.json';
      console.log(`Dados de demonstração criados ${target}: ${counts.users} contas, ${counts.donations} doações, ${counts.posts} publicações, ${counts.messages} mensagens e ${counts.notifications} notificações.`);
      console.log(`Entre com qualquer conta, por exemplo ana@example.com, usando a senha ${DEMO_PASSWORD}.`);
      console.log(`Contas: ${Object.values(PEOPLE).map(person => person.email).join(', ')}.`);
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { DEMO_PASSWORD, PEOPLE, seedDemo };
