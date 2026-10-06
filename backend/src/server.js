import Fastify from 'fastify';
import cors from '@fastify/cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'todolist',
  waitForConnections: true,
  connectionLimit: 10,
});

app.get('/api/health', async () => {
  await pool.query('SELECT 1');
  return { ok: true };
});

app.get('/api/tasks', async (request, reply) => {
  const { search = '', status = 'all' } = request.query || {};
  const conditions = [];
  const params = [];

  if (search.trim()) {
    conditions.push('title LIKE ?');
    params.push(`%${search.trim()}%`);
  }

  if (status === 'pending') conditions.push('completed = 0');
  if (status === 'completed') conditions.push('completed = 1');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [tasks] = await pool.query(
    `SELECT id, title, completed, due_date, created_at, updated_at
     FROM tasks ${where}
     ORDER BY completed ASC, due_date IS NULL ASC, due_date ASC, id DESC`,
    params
  );

  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(completed = 1), 0) AS completed
     FROM tasks`
  );

  return {
    tasks,
    total: Number(totals.total),
    completed: Number(totals.completed),
  };
});

app.post('/api/tasks', async (request, reply) => {
  const { title, dueDate = null } = request.body || {};

  if (!title || !title.trim()) {
    return reply.code(400).send({ message: 'O título da tarefa é obrigatório.' });
  }

  const [result] = await pool.execute(
    'INSERT INTO tasks (title, due_date) VALUES (?, ?)',
    [title.trim(), dueDate || null]
  );

  const [rows] = await pool.execute(
    'SELECT id, title, completed, due_date, created_at, updated_at FROM tasks WHERE id = ?',
    [result.insertId]
  );

  return reply.code(201).send(rows[0]);
});

app.patch('/api/tasks/:id', async (request, reply) => {
  const id = Number(request.params.id);
  const { title, dueDate, completed } = request.body || {};

  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ message: 'ID da tarefa inválido.' });
  }

  const fields = [];
  const values = [];

  if (title !== undefined) {
    if (!String(title).trim()) {
      return reply.code(400).send({ message: 'O título da tarefa não pode ficar vazio.' });
    }
    fields.push('title = ?');
    values.push(String(title).trim());
  }

  if (dueDate !== undefined) {
    fields.push('due_date = ?');
    values.push(dueDate || null);
  }

  if (completed !== undefined) {
    fields.push('completed = ?');
    values.push(Boolean(completed));
  }

  if (!fields.length) {
    return reply.code(400).send({ message: 'Nenhuma alteração informada.' });
  }

  values.push(id);

  const [result] = await pool.execute(
    `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  if (result.affectedRows === 0) {
    return reply.code(404).send({ message: 'Tarefa não encontrada.' });
  }

  const [rows] = await pool.execute(
    'SELECT id, title, completed, due_date, created_at, updated_at FROM tasks WHERE id = ?',
    [id]
  );

  return rows[0];
});

app.delete('/api/tasks/:id', async (request, reply) => {
  const id = Number(request.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ message: 'ID da tarefa inválido.' });
  }

  const [result] = await pool.execute('DELETE FROM tasks WHERE id = ?', [id]);

  if (result.affectedRows === 0) {
    return reply.code(404).send({ message: 'Tarefa não encontrada.' });
  }

  return reply.code(204).send();
});

const port = Number(process.env.PORT || 3333);

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
