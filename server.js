const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 1. Conexão com o banco de dados
const db = new sqlite3.Database('./banco.db', (err) => {
  if (err) console.error('Erro ao abrir o banco de dados:', err.message);
  else console.log('📂 Conectado ao banco de dados SQLite (banco.db).');
});

// 2. Criação das tabelas
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS profissionais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS chamadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT,
    profissional TEXT,
    servico TEXT,
    horario TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const profsIniciais = [
    "ANA", "ANY EVILYN", "BRUNA MEL", "DANIELA", "ELAINE", 
    "ESTER", "HEIDE", "LARISSA", "LEILIANE", "RAISSA", 
    "SANDRA CASTRO", "SANDRA DIAS", "TAMIRIS", "TATI"
  ];
  const stmtProf = db.prepare("INSERT OR IGNORE INTO profissionais (nome) VALUES (?)");
  profsIniciais.forEach(p => stmtProf.run(p));
  stmtProf.finalize();

  const servsIniciais = [
    "ADICIONAL ESCOVA MODELADORA", "APLICAÇÃO - FRESH MINT", "BUÇO", "CILIOS - UNIDADE", 
    "DESIGN SOBRANCELHAS", "ESMALTAÇÃO", "FAST 10 L", "FAST DIFUSOR", "FAST ESCOVA - BABYLISS", 
    "FAST ESCOVA - CHAPINHA", "FAST ESCOVA - LISA", "FAST ESCOVA - MODELADA", 
    "FAST ESCOVA MEGA HAIR - LISA", "FAST ESCOVA MEGA HAIR - MODELADA", 
    "FAST HIDRATAÇÃO - FAST MASK", "FAST LAVAGEM", "FAST MAKE CASUAL", "FAST MAKE VIP", 
    "FAST NUTRI", "FAST PENTEADO", "FAST RECONSTRUÇÃO - BELLE RECOVERY", "FAST RETOQUE", 
    "FAST TRANÇAS", "FAST UMECTAÇÃO - OLEO NUTRITIVO", "FRANCESINHA", "MÃOS", 
    "OZONIOTERAPIA", "OZONIOTERAPIA INCLUIDO NO TRATAMENTO", "PINTURA DE SOBRANCELHAS - HENNA", 
    "PLÁSTICA DOS PÉS", "PLÁSTICA DOS PÉS VIP", "PÉS", "PÉS E MÃOS", "VELATERAPIA"
  ];
  const stmtServ = db.prepare("INSERT OR IGNORE INTO servicos (nome) VALUES (?)");
  servsIniciais.forEach(s => stmtServ.run(s));
  stmtServ.finalize();
});

function enviarListas(socketTarget = io) {
  db.all("SELECT nome FROM profissionais ORDER BY nome ASC", [], (err, profs) => {
    if (err) return console.error(err);
    db.all("SELECT nome FROM servicos ORDER BY nome ASC", [], (err, servs) => {
      if (err) return console.error(err);
      socketTarget.emit('atualizar-listas', {
        profissionais: profs.map(p => p.nome),
        servicos: servs.map(s => s.nome)
      });
    });
  });
}

// 3. Socket.io
io.on('connection', (socket) => {
  enviarListas(socket);

  socket.on('chamar-profissional', (data) => {
    const agora = new Date();
    const horario = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const chamadaCompleta = { ...data, horario };

    db.run(
      `INSERT INTO chamadas (cliente, profissional, servico, horario) VALUES (?, ?, ?, ?)`,
      [data.cliente, data.profissional, data.servico, horario],
      (err) => {
        if (err) console.error("Erro ao salvar chamada no banco:", err);
      }
    );

    io.emit('nova-chamada', chamadaCompleta);
  });

  socket.on('adicionar-item', (data) => {
    const tabela = data.tipo === 'profissional' ? 'profissionais' : 'servicos';
    db.run(`INSERT OR IGNORE INTO ${tabela} (nome) VALUES (?)`, [data.valor], (err) => {
      if (err) console.error(err);
      else enviarListas();
    });
  });

  socket.on('remover-item', (data) => {
    const tabela = data.tipo === 'profissional' ? 'profissionais' : 'servicos';
    db.run(`DELETE FROM ${tabela} WHERE nome = ?`, [data.valor], (err) => {
      if (err) console.error(err);
      else enviarListas();
    });
  });
});

// 4. Rota do Relatório (OBRIGATÓRIO TER ESTA PARTE)
app.get('/api/relatorio', (req, res) => {
  const { dataInicio, dataFim } = req.query;

  let query = `SELECT id, cliente, profissional, servico, horario, data_criacao 
               FROM chamadas WHERE 1=1`;
  const params = [];

  if (dataInicio) {
    query += ` AND date(data_criacao) >= date(?)`;
    params.push(dataInicio);
  }
  if (dataFim) {
    query += ` AND date(data_criacao) <= date(?)`;
    params.push(dataFim);
  }

  query += ` ORDER BY id DESC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});