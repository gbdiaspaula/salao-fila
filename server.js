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
  // Tabela principal de chamadas
  db.run(`
    CREATE TABLE IF NOT EXISTS chamadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      status TEXT DEFAULT 'aguardando',
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela relacional para múltiplos serviços e profissionais
  db.run(`
    CREATE TABLE IF NOT EXISTS chamada_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chamada_id INTEGER NOT NULL,
      profissional TEXT NOT NULL,
      servico TEXT NOT NULL,
      FOREIGN KEY (chamada_id) REFERENCES chamadas(id) ON DELETE CASCADE
    )
  `);
});

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
// Rota para buscar os dados completos do relatório
app.get('/api/relatorio', (req, res) => {
  const { dataInicio, dataFim } = req.query;

  // Consulta SQL com JOIN unificando 'chamadas' e 'chamada_itens'
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

  // Executa a consulta no SQLite passando os parâmetros de data
  db.all(sql, [dataInicio, dataFim], (err, rows) => {
    if (err) {
      console.error("Erro ao buscar relatório:", err.message);
      return res.status(500).json({ error: "Erro ao buscar dados do relatório." });
    }
    
    // Retorna a lista de atendimentos para o frontend
    res.json(rows);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});