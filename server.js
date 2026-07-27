const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Banco de Dados SQLite
const db = new sqlite3.Database('./banco.db', (err) => {
  if (err) {
    console.error('Erro ao abrir banco:', err.message);
  } else {
    console.log('📂 Banco SQLite conectado com sucesso.');
  }
});

// Criar Tabelas Relacionais
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS chamadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      status TEXT DEFAULT 'aguardando',
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chamada_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chamada_id INTEGER NOT NULL,
      profissional TEXT NOT NULL,
      servico TEXT NOT NULL,
      FOREIGN KEY (chamada_id) REFERENCES chamadas(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE TABLE IF NOT EXISTS profissionais (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS servicos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT)`);
});

// --- ROTAS DA API ---

// Listar Profissionais
app.get('/api/profissionais', (req, res) => {
  db.all(`SELECT * FROM profissionais`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Listar Serviços
app.get('/api/servicos', (req, res) => {
  db.all(`SELECT * FROM servicos`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Criar Nova Chamada Múltipla
app.post('/api/chamar', (req, res) => {
  const { cliente, itens } = req.body;

  if (!cliente || !itens || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'Dados inválidos.' });
  }

  db.run(`INSERT INTO chamadas (cliente) VALUES (?)`, [cliente], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    const chamadaId = this.lastID;
    const stmt = db.prepare(`INSERT INTO chamada_itens (chamada_id, profissional, servico) VALUES (?, ?, ?)`);

    itens.forEach(item => {
      stmt.run(chamadaId, item.profissional, item.servico);
    });

    stmt.finalize();

    io.emit('nova_chamada', { id: chamadaId, cliente, itens });
    res.json({ success: true, id: chamadaId });
  });
});

// Obter Dados para Relatório (JOIN)
app.get('/api/relatorio', (req, res) => {
  const { dataInicio, dataFim } = req.query;
  const sql = `
    SELECT 
      c.id,
      c.cliente,
      ci.profissional,
      ci.servico,
      c.data_criacao
    FROM chamadas c
    INNER JOIN chamada_itens ci ON c.id = ci.chamada_id
    WHERE DATE(c.data_criacao) BETWEEN ? AND ?
    ORDER BY c.data_criacao DESC
  `;

  db.all(sql, [dataInicio, dataFim], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Inicialização na porta dinâmica do Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});