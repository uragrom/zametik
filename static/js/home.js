// Главная страница - красивая версия
let graphView = null;
let searchHighlight = null;
let calendar = null;
let notesList = [];
let allLinks = [];
let isGraphExpanded = false;

// Проверка аутентификации
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (data.initialized && data.authenticated) {
            showHome();
        } else if (data.initialized && !data.authenticated) {
            showLogin();
        } else {
            showInit();
        }
    } catch (error) {
        console.error('Ошибка проверки статуса:', error);
        showLogin();
    }
}

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('home-app').style.display = 'none';
}

function showInit() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('init-form').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('home-app').style.display = 'none';
}

function showHome() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('home-app').style.display = 'flex';
    
    initComponents();
    loadAllData();
}

function initComponents() {
    // Граф
    if (!graphView) {
        const canvas = document.getElementById('graph-canvas');
        if (canvas) {
            graphView = new GraphView('graph-canvas');
            graphView.onNodeClick = (noteId) => {
                window.location.href = `/?note=${noteId}`;
            };
        }
    }
    
    // Поиск
    if (!searchHighlight) {
        const input = document.getElementById('home-search-input');
        const results = document.getElementById('home-search-results');
        if (input && results) {
            searchHighlight = new SearchHighlight('home-search-input', 'home-search-results');
            searchHighlight.onNoteClick = (noteId) => {
                window.location.href = `/?note=${noteId}`;
            };
        }
    }
    
    // Календарь
    if (!calendar) {
        const container = document.getElementById('calendar-container');
        if (container) {
            calendar = new Calendar('calendar-container');
        }
    }
}

async function loadAllData() {
    await Promise.all([
        loadNotes(),
        loadGraphData(),
        loadStats(),
        loadRecentNotes(),
        loadAccessHistory()
    ]);
}

async function loadNotes() {
    try {
        const response = await fetch('/api/notes');
        const data = await response.json();
        
        if (response.ok) {
            notesList = data.notes || [];
        }
    } catch (error) {
        console.error('Ошибка загрузки заметок:', error);
    }
}

async function loadGraphData() {
    try {
        const response = await fetch('/api/home');
        const data = await response.json();
        
        if (response.ok) {
            // Сохраняем данные для модалки связей
            notesList = data.notes || [];
            allLinks = data.links || [];
            
            if (graphView) {
                graphView.setData(data);
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки данных графа:', error);
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/notes');
        const data = await response.json();
        
        if (response.ok && data.notes) {
            const notes = data.notes;
            const notesCount = notes.length;
            
            const tagsSet = new Set();
            for (const note of notes) {
                if (note.tags) {
                    note.tags.forEach(tag => tagsSet.add(tag));
                }
            }
            
            document.getElementById('stats-notes-count').textContent = notesCount;
            document.getElementById('stats-tags-count').textContent = tagsSet.size;
            document.getElementById('home-notes-count').textContent = `${notesCount} заметок`;
            
            // Приветствие
            const hour = new Date().getHours();
            let greeting = 'Привет!';
            if (hour >= 5 && hour < 12) {
                greeting = 'Доброе утро! ☀️';
            } else if (hour >= 12 && hour < 18) {
                greeting = 'Добрый день! 👋';
            } else if (hour >= 18 && hour < 22) {
                greeting = 'Добрый вечер! 🌙';
            } else {
                greeting = 'Доброй ночи! 🌟';
            }
            document.getElementById('home-greeting-text').textContent = greeting;
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

async function loadRecentNotes() {
    try {
        const response = await fetch('/api/notes');
        const data = await response.json();
        
        if (response.ok && data.notes) {
            const notes = data.notes
                .sort((a, b) => new Date(b.modified) - new Date(a.modified))
                .slice(0, 5);
            
            const container = document.getElementById('home-recent-notes');
            if (!container) return;
            
            if (notes.length === 0) {
                container.innerHTML = '<div class="empty-state">Нет заметок</div>';
                return;
            }
            
            container.innerHTML = notes.map(note => `
                <div class="recent-item" data-note-id="${note.id}">
                    <div class="recent-item-title">${escapeHtml(note.title)}</div>
                    <div class="recent-item-date">${formatTimeAgo(note.modified)}</div>
                </div>
            `).join('');
            
            container.querySelectorAll('.recent-item').forEach(item => {
                item.addEventListener('click', () => {
                    window.location.href = `/?note=${item.dataset.noteId}`;
                });
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки последних заметок:', error);
    }
}

async function loadAccessHistory() {
    try {
        const response = await fetch('/api/access-history?limit=10');
        const data = await response.json();
        
        if (response.ok && data.history) {
            const container = document.getElementById('home-access-history');
            if (!container) return;
            
            if (data.history.length === 0) {
                container.innerHTML = '<div class="empty-state">Нет истории</div>';
                return;
            }
            
            container.innerHTML = data.history.reverse().slice(0, 5).map(entry => {
                const actionText = {
                    'open': '👁️',
                    'edit': '✏️',
                    'create': '➕',
                    'delete': '🗑️'
                }[entry.action] || '•';
                
                return `
                    <div class="history-entry" data-note-id="${entry.note_id}">
                        <div class="history-entry-action">${actionText}</div>
                        <div class="history-entry-title">${escapeHtml(entry.note_title)}</div>
                        <div class="history-entry-time">${formatTimeAgo(entry.date)}</div>
                    </div>
                `;
            }).join('');
            
            container.querySelectorAll('.history-entry').forEach(item => {
                const noteId = item.dataset.noteId;
                if (noteId) {
                    item.addEventListener('click', () => {
                        window.location.href = `/?note=${noteId}`;
                    });
                }
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
    }
}

function formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин`;
    if (hours < 24) return `${hours} ч`;
    if (days < 7) return `${days} дн`;
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(400px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function toggleGraphExpand() {
    const graphCard = document.querySelector('.graph-card');
    if (!graphCard) return;
    
    isGraphExpanded = !isGraphExpanded;
    
    if (isGraphExpanded) {
        graphCard.classList.add('expanded');
        document.getElementById('graph-expand-btn').textContent = '✕';
    } else {
        graphCard.classList.remove('expanded');
        document.getElementById('graph-expand-btn').textContent = '⛶';
    }
    
    setTimeout(() => {
        if (graphView) {
            graphView.resize();
        }
    }, 100);
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    
    // Кнопка возврата
    document.getElementById('home-back-btn')?.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    // Выход
    document.getElementById('home-logout-btn')?.addEventListener('click', async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
            showLogin();
        } catch (error) {
            console.error('Ошибка выхода:', error);
        }
    });
    
    // Фильтры графа
    document.querySelectorAll('.graph-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.graph-btn[data-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            if (graphView) {
                graphView.applyFilter(filter);
            }
        });
    });
    
    // Развертывание графа
    document.getElementById('graph-expand-btn')?.addEventListener('click', toggleGraphExpand);
    
    // Инициализация/логин
    document.getElementById('init-btn')?.addEventListener('click', handleInit);
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
    
    document.getElementById('init-password')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleInit();
    });
    
    document.getElementById('login-password')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    
});

async function handleInit() {
    const password = document.getElementById('init-password').value;
    const passwordConfirm = document.getElementById('init-password-confirm').value;
    const errorDiv = document.getElementById('login-error');
    
    if (!password) {
        errorDiv.textContent = 'Введите пароль';
        return;
    }
    
    if (password !== passwordConfirm) {
        errorDiv.textContent = 'Пароли не совпадают';
        return;
    }
    
    try {
        const response = await fetch('/api/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showHome();
        } else {
            errorDiv.textContent = data.error || 'Ошибка инициализации';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка подключения к серверу';
    }
}

async function handleLogin() {
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    
    if (!password) {
        errorDiv.textContent = 'Введите пароль';
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showHome();
        } else {
            errorDiv.textContent = data.error || 'Неверный пароль';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка подключения к серверу';
    }
}
