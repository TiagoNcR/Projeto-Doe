// Cliente mínimo da API REST do Upstash Redis, o banco oferecido pelo painel da Vercel.
// Usa apenas `fetch`, sem dependências. O banco inteiro fica em uma chave e a versão em outra:
// ler só a versão (poucos bytes) permite saber se é preciso baixar os dados de novo.

function createRedisStore({ url, token, prefix = 'projeto-doe', fetchImpl = globalThis.fetch }) {
  const dataKey = `${prefix}:data`;
  const versionKey = `${prefix}:version`;

  async function command(args) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok || !payload || payload.error) {
      const reason = payload && payload.error ? payload.error : `HTTP ${response.status}`;
      throw new Error(`O Redis recusou o comando ${args[0]}: ${reason}`);
    }
    return payload.result;
  }

  return {
    async readVersion() {
      return command(['GET', versionKey]);
    },

    async read() {
      const [data, version] = await command(['MGET', dataKey, versionKey]);
      return { data: data ? JSON.parse(data) : null, version };
    },

    async write(database, version) {
      // MSET grava as duas chaves de uma vez: ninguém lê dados novos com a versão antiga.
      await command(['MSET', dataKey, JSON.stringify(database), versionKey, version]);
    },

    async readImage(id) {
      const value = await command(['GET', `${prefix}:image:${id}`]);
      return value ? JSON.parse(value) : null;
    },

    async writeImage(id, image) {
      await command(['SET', `${prefix}:image:${id}`, JSON.stringify(image)]);
    },

    async deleteImages(ids) {
      if (ids.length) await command(['DEL', ...ids.map(id => `${prefix}:image:${id}`)]);
    }
  };
}

// A integração do Upstash na Vercel cria as variáveis KV_REST_API_*; projetos criados
// direto no Upstash usam UPSTASH_REDIS_REST_*. Sem nenhuma delas, o projeto usa o data.json.
function storeFromEnvironment(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? createRedisStore({ url, token }) : null;
}

module.exports = { createRedisStore, storeFromEnvironment };
