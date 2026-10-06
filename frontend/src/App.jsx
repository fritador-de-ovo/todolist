import React, { useEffect, useMemo, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

function formatDate(date) {
  if (!date) return '';
  const [year, month, day] = date.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function isOverdue(task) {
  if (task.completed || !task.due_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${task.due_date.slice(0, 10)}T00:00:00`);
  return due < today;
}

async function request(path, options = {}) {
  const { headers, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      // Só envia Content-Type quando existe body (DELETE/GET não têm)
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
  });

  if (!response.ok) {
    let message = 'Não foi possível realizar a operação.';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {}
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // modal: null (fechado) | { mode: 'create' | 'edit', id?, title, dueDate }
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  async function loadTasks() {
    try {
      setError('');
      const params = new URLSearchParams({
        search,
        status,
      });
      const data = await request(`/api/tasks?${params.toString()}`);
      setTasks(data.tasks || []);
      setTotal(Number(data.total) || 0);
      setCompletedTotal(Number(data.completed) || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadTasks, 250);
    return () => clearTimeout(timer);
  }, [search, status]);

  async function toggleTask(task) {
    try {
      setError('');
      await request(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !task.completed }),
      });
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTask(task) {
    try {
      setError('');
      await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveTask(event) {
    event.preventDefault();
    if (!modal.title.trim()) return;

    const isEdit = modal.mode === 'edit';
    try {
      setSaving(true);
      setError('');
      await request(isEdit ? `/api/tasks/${modal.id}` : '/api/tasks', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: modal.title.trim(),
          dueDate: modal.dueDate || null,
        }),
      });
      setModal(null);
      await loadTasks();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const pendingTotal = Math.max(total - completedTotal, 0);

  const emptyMessage = useMemo(() => {
    if (search) return 'No tasks found for this search.';
    if (status === 'completed') return 'You have no completed tasks.';
    return 'You have no pending tasks.';
  }, [search, status]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong className="logo">to<i>.</i>do</strong>
        </div>
      </header>

      <main className="container">
        <section className="stats">
          <div className="stat-card">
            <div>
              <small>Total</small>
              <strong>{total}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <small>Pendentes</small>
              <strong>{pendingTotal}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <small>Concluídas</small>
              <strong>{completedTotal}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          {error && (
            <div className="error-message" role="alert">
              <span>!</span> {error}
            </div>
          )}

          <div className="toolbar">
            <div className="filters" aria-label="Filtrar tarefas">
              <button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')} type="button">
                Todas
              </button>
              <button className={status === 'pending' ? 'active' : ''} onClick={() => setStatus('pending')} type="button">
                Pendentes
              </button>
              <button className={status === 'completed' ? 'active' : ''} onClick={() => setStatus('completed')} type="button">
                Concluídas
              </button>
            </div>

            <div className="search-box">
              <span>⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tarefa..."
                aria-label="Buscar tarefa"
              />
            </div>
          </div>

          <div className="task-list">
            {loading ? (
              <div className="state-message">Carregando tarefas...</div>
            ) : tasks.length === 0 ? (
              <div className="state-message empty">
                <div className="empty-icon">✓</div>
                <strong>{emptyMessage}</strong>
              </div>
            ) : (
              tasks.map((task) => (
                <article className={`task ${task.completed ? 'completed' : ''} ${isOverdue(task) ? 'is-overdue' : ''}`} key={task.id}>
                  <button
                    className={`check ${task.completed ? 'checked' : ''}`}
                    onClick={() => toggleTask(task)}
                    type="button"
                    aria-label={task.completed ? 'Reabrir tarefa' : 'Concluir tarefa'}
                  >
                    {task.completed ? '✓' : ''}
                  </button>

                  <div className="task-content">
                    <h3 className={isOverdue(task) ? 'overdue-title' : ''}>{task.title}</h3>
                    {task.due_date && (
                      <span className={`due ${isOverdue(task) ? 'overdue' : ''}`}>
                        <span>◷</span>
                        Prazo · {formatDate(task.due_date)}
                        {isOverdue(task) && <em className="overdue-badge">Em atraso</em>}
                      </span>
                    )}
                  </div>

                  <div className="task-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() =>
                        setModal({
                          mode: 'edit',
                          id: task.id,
                          title: task.title,
                          dueDate: task.due_date ? task.due_date.slice(0, 10) : '',
                        })
                      }
                      aria-label="Editar tarefa"
                      title="Editar"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-button delete"
                      onClick={() => deleteTask(task)}
                      aria-label="Excluir tarefa"
                      title="Excluir"
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>

      <button
        type="button"
        className="fab"
        aria-label="Create Task"
        title="Create Task"
        onClick={() => setModal({ mode: 'create', title: '', dueDate: '' })}
      >
        +
      </button>

      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">TAREFA</p>
                <h2>{modal.mode === 'edit' ? 'Edit Task' : 'Create Task'}</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setModal(null)} aria-label="Fechar">×</button>
            </div>

            <form onSubmit={saveTask}>
              <div className="input-wrap">
                <label htmlFor="task-title">Nome</label>
                <input
                  id="task-title"
                  value={modal.title}
                  onChange={(e) => setModal({ ...modal, title: e.target.value })}
                  placeholder="Ex.: Estudar Fastify"
                  maxLength={255}
                  autoFocus
                />
              </div>

              <div className="input-wrap">
                <label htmlFor="task-date">Data limite <span>(opcional)</span></label>
                <input
                  id="task-date"
                  type="date"
                  value={modal.dueDate}
                  onChange={(e) => setModal({ ...modal, dueDate: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button className="primary-button" type="submit" disabled={saving || !modal.title.trim()}>
                  {modal.mode === 'edit' ? 'Salvar alterações' : 'Criar tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}