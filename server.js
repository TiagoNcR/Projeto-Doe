const { createServer } = require('./src/server');

const port = process.env.PORT || 3000;
createServer().listen(port, () => {
  console.log(`Projeto Doe rodando em http://localhost:${port}`);
});
