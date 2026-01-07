// Глобальные переменные
let currentNoteId = null;
let autoSaveTimer = null;
let notesList = [];
let canvasEditor = null;
let kanbanEditor = null;
let currentNoteType = 'text';
let currentNoteLinks = [];

// Настройка marked для markdown
if (typeof marked !== 'undefined') {
    marked.setOptions({
        breaks: true,
        gfm: true,
        highlight: function(code, lang) {
            if (typeof Prism !== 'undefined' && lang && Prism.languages[lang]) {
                return Prism.highlight(code, Prism.languages[lang], lang);
            }
            return code;
        }
    });
}

// Функции для переключения редакторов
function showCanvasEditor() {
    document.getElementById('text-editor-container').style.display = 'none';
    document.getElementById('canvas-editor-container').style.display = 'flex';
    document.getElementById('kanban-editor-container').style.display = 'none';
    document.getElementById('editor-tabs').style.display = 'none';
    
    // Восстанавливаем заголовок для canvas
    const noteHeader = document.querySelector('.note-header');
    if (noteHeader) noteHeader.style.display = '';
    
    const editorWrapper = document.querySelector('.editor-wrapper');
    if (editorWrapper) editorWrapper.style.padding = '';
    
    if (!canvasEditor) {
        canvasEditor = new CanvasEditor('canvas-editor');
        canvasEditor.onChange = () => {
            if (currentNoteId) {
                scheduleAutoSave();
                updateStats();
            }
        };
        setupCanvasHandlers();
    }
}

function showTextEditor() {
    const textContainer = document.getElementById('text-editor-container');
    const canvasContainer = document.getElementById('canvas-editor-container');
    const kanbanContainer = document.getElementById('kanban-editor-container');
    const editorTabs = document.getElementById('editor-tabs');
    
    if (textContainer) textContainer.style.display = 'flex';
    if (canvasContainer) canvasContainer.style.display = 'none';
    if (kanbanContainer) kanbanContainer.style.display = 'none';
    if (editorTabs) editorTabs.style.display = 'flex';
    
    // Восстанавливаем заголовок и padding для текстового редактора
    const noteHeader = document.querySelector('.note-header');
    if (noteHeader) noteHeader.style.display = '';
    
    const editorWrapper = document.querySelector('.editor-wrapper');
    if (editorWrapper) editorWrapper.style.padding = '';
}

function showKanbanEditor() {
    document.getElementById('text-editor-container').style.display = 'none';
    document.getElementById('canvas-editor-container').style.display = 'none';
    document.getElementById('kanban-editor-container').style.display = 'flex';
    document.getElementById('editor-tabs').style.display = 'none';
    
    // Показываем заголовок заметки (для редактирования названия)
    const noteHeader = document.querySelector('.note-header');
    if (noteHeader) noteHeader.style.display = '';
    
    // Уменьшаем padding у editor-wrapper для kanban
    const editorWrapper = document.querySelector('.editor-wrapper');
    if (editorWrapper) editorWrapper.style.padding = '0.5rem';
    
    if (!kanbanEditor) {
        kanbanEditor = new KanbanEditor('kanban-editor-container');
        kanbanEditor.onChange = () => {
            if (currentNoteId) {
                scheduleAutoSave();
                updateStats();
            }
        };
    }
}

function setupCanvasHandlers() {
    if (!canvasEditor) return;
    
    // Инструменты
    document.querySelectorAll('.canvas-tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.canvas-tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tool = btn.dataset.tool;
            canvasEditor.setTool(tool);
        });
    });
    
    // Цвета
    document.getElementById('canvas-color')?.addEventListener('change', (e) => {
        canvasEditor.setColor(e.target.value);
    });
    
    document.getElementById('canvas-fill-color')?.addEventListener('change', (e) => {
        canvasEditor.setFillColor(e.target.value);
    });
    
    // Стиль линии
    document.getElementById('canvas-line-style')?.addEventListener('change', (e) => {
        canvasEditor.setLineStyle(e.target.value);
    });
    
    // Стиль стрелки
    document.getElementById('canvas-arrow-style')?.addEventListener('change', (e) => {
        canvasEditor.setArrowStyle(e.target.value);
    });
    
    // Форма блока
    document.getElementById('canvas-node-shape')?.addEventListener('change', (e) => {
        const shape = e.target.value;
        canvasEditor.setNodeShape(shape);
        // Если блок выделен, меняем его форму
        if (canvasEditor.selectedNode) {
            canvasEditor.selectedNode.shape = shape;
            canvasEditor.redraw();
        }
    });
    
    // Загрузка изображения
    document.getElementById('canvas-upload-btn')?.addEventListener('click', () => {
        document.getElementById('canvas-image-upload').click();
    });
    
    document.getElementById('canvas-image-upload')?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            canvasEditor.loadImage(e.target.files[0]);
        }
    });
    
    // TODO для блока
    document.getElementById('canvas-todo-btn')?.addEventListener('click', () => {
        if (canvasEditor) {
            canvasEditor.toggleTodo();
        }
    });
    
    // Удаление
    document.getElementById('canvas-delete-btn')?.addEventListener('click', () => {
        canvasEditor.deleteSelected();
    });
    
    // Палитра цветов
    const paletteBtn = document.getElementById('canvas-palette-btn');
    const paletteDropdown = document.getElementById('canvas-palette-dropdown');
    
    paletteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = paletteDropdown.style.display !== 'none';
        paletteDropdown.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            renderPalette();
        }
    });
    
    // Закрытие палитры при клике вне
    document.addEventListener('click', (e) => {
        if (paletteDropdown && !paletteDropdown.contains(e.target) && e.target !== paletteBtn) {
            paletteDropdown.style.display = 'none';
        }
    });
    
    // Добавление цвета в палитру
    document.getElementById('canvas-palette-add-btn')?.addEventListener('click', () => {
        const colorInput = document.getElementById('canvas-palette-add-color');
        if (colorInput && canvasEditor) {
            canvasEditor.addColorToPalette(colorInput.value);
            renderPalette();
        }
    });
    
    // Удаление по клавише Delete (только для canvas, не для kanban - там свои обработчики)
    document.addEventListener('keydown', (e) => {
        if (canvasEditor && currentNoteType === 'canvas') {
            const activeElement = document.activeElement;
            if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
                // Delete - удалить выделенное
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    canvasEditor.deleteSelected();
                    e.preventDefault();
                }
                // Ctrl+A - выделить всё
                if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                    canvasEditor.selectAll();
                    e.preventDefault();
                }
            }
        }
    });
}

// Рендер палитры цветов
function renderPalette() {
    const container = document.getElementById('canvas-palette-colors');
    if (!container || !canvasEditor) return;
    
    container.innerHTML = '';
    canvasEditor.colorPalette.forEach(color => {
        const colorDiv = document.createElement('div');
        colorDiv.className = 'canvas-palette-color';
        colorDiv.style.backgroundColor = color;
        
        // Кнопка удаления
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-color';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            canvasEditor.removeColorFromPalette(color);
            renderPalette();
        });
        colorDiv.appendChild(removeBtn);
        
        // Выбор цвета
        colorDiv.addEventListener('click', () => {
            document.getElementById('canvas-color').value = color;
            canvasEditor.setColor(color);
            document.querySelectorAll('.canvas-palette-color').forEach(c => c.classList.remove('selected'));
            colorDiv.classList.add('selected');
        });
        
        container.appendChild(colorDiv);
    });
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupEventListeners();
});

// Проверка статуса аутентификации
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (data.initialized && data.authenticated) {
            showApp();
            loadNotes().then(() => {
                // Проверяем параметр note в URL
                const urlParams = new URLSearchParams(window.location.search);
                const noteId = urlParams.get('note');
                if (noteId) {
                    loadNote(noteId);
                }
            });
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

// Показать экран инициализации
function showInit() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('init-form').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('login-error').textContent = '';
}

// Показать экран входа
function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('init-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('login-error').textContent = '';
}

// Показать приложение
function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    loadGlobalTodos();
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Инициализация
    document.getElementById('init-btn')?.addEventListener('click', handleInit);
    document.getElementById('init-password')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleInit();
    });
    document.getElementById('init-password-confirm')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleInit();
    });
    
    // Вход
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
    document.getElementById('login-password')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    
    // Выход
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    
    // Создание заметки
    document.getElementById('new-note-btn')?.addEventListener('click', () => {
        document.getElementById('new-note-modal').style.display = 'flex';
        document.getElementById('new-note-title').focus();
    });
    
    document.getElementById('create-note-btn')?.addEventListener('click', handleCreateNote);
    document.getElementById('cancel-note-btn')?.addEventListener('click', () => {
        document.getElementById('new-note-modal').style.display = 'none';
        document.getElementById('new-note-title').value = '';
    });
    
    // Случайная заметка
    document.getElementById('random-note-btn')?.addEventListener('click', loadRandomNote);
    
    // Копирование заметки
    document.getElementById('duplicate-note-btn')?.addEventListener('click', duplicateNote);
    
    // Экспорт
    document.getElementById('export-btn')?.addEventListener('click', exportNote);
    
    // Сохранение
    document.getElementById('save-now-btn')?.addEventListener('click', () => {
        if (currentNoteId) {
            autoSave();
        } else {
            showToast('Откройте заметку для сохранения', 'warning');
        }
    });
    
    // Поиск
    document.getElementById('search-input')?.addEventListener('input', handleSearch);
    document.getElementById('search-focus-btn')?.addEventListener('click', () => {
        document.getElementById('search-input').focus();
    });
    
    // Настройки
    document.getElementById('settings-btn')?.addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'flex';
    });
    document.getElementById('close-settings-btn')?.addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'none';
    });
    document.getElementById('change-password-menu-btn')?.addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'none';
        openChangePasswordModal();
    });
    
    // Смена пароля
    document.getElementById('change-password-submit-btn')?.addEventListener('click', handleChangePassword);
    document.getElementById('change-password-cancel-btn')?.addEventListener('click', () => {
        document.getElementById('change-password-modal').style.display = 'none';
        document.getElementById('change-password-old').value = '';
        document.getElementById('change-password-new').value = '';
        document.getElementById('change-password-confirm').value = '';
        document.getElementById('change-password-error').textContent = '';
    });
    document.getElementById('change-password-old')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('change-password-new').focus();
    });
    document.getElementById('change-password-new')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('change-password-confirm').focus();
    });
    document.getElementById('change-password-confirm')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChangePassword();
    });
    
    // Закрытие модального окна смены пароля по клику вне его
    document.getElementById('change-password-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'change-password-modal') {
            document.getElementById('change-password-modal').style.display = 'none';
        }
    });
    
    // Закрытие модального окна настроек по клику вне его
    document.getElementById('settings-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') {
            document.getElementById('settings-modal').style.display = 'none';
        }
    });
    
    // Теги
    document.getElementById('note-tags-input')?.addEventListener('input', updateTagsInput);
    
    // Редактор
    document.getElementById('note-editor')?.addEventListener('input', handleEditorChange);
    document.getElementById('note-title')?.addEventListener('input', handleTitleChange);
    
    // Вкладки редактора
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });
    
    // Кнопки форматирования
    document.getElementById('bold-btn')?.addEventListener('click', () => insertMarkdown('**', '**'));
    document.getElementById('italic-btn')?.addEventListener('click', () => insertMarkdown('*', '*'));
    document.getElementById('code-btn')?.addEventListener('click', () => insertMarkdown('`', '`'));
    document.getElementById('quote-btn')?.addEventListener('click', () => insertMarkdown('> ', ''));
    document.getElementById('h1-btn')?.addEventListener('click', () => insertMarkdown('# ', ''));
    document.getElementById('h2-btn')?.addEventListener('click', () => insertMarkdown('## ', ''));
    document.getElementById('h3-btn')?.addEventListener('click', () => insertMarkdown('### ', ''));
    
    // Закрытие модального окна по клику вне его
    document.getElementById('new-note-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'new-note-modal') {
            document.getElementById('new-note-modal').style.display = 'none';
        }
    });
    
    // Словарь
    document.getElementById('dictionary-btn')?.addEventListener('click', openDictionary);
    document.getElementById('close-dict-btn')?.addEventListener('click', () => {
        document.getElementById('dictionary-modal').style.display = 'none';
    });
    document.getElementById('add-phrase-btn')?.addEventListener('click', handleAddPhrase);
    document.getElementById('insert-phrase-btn')?.addEventListener('click', handleInsertPhrase);
    
    // Просмотр фразы
    document.getElementById('close-phrase-viewer-btn')?.addEventListener('click', () => {
        document.getElementById('phrase-viewer-modal').style.display = 'none';
    });
    
    // Закрытие модальных окон по клику вне их
    document.getElementById('dictionary-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'dictionary-modal') {
            document.getElementById('dictionary-modal').style.display = 'none';
        }
    });
    document.getElementById('phrase-viewer-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'phrase-viewer-modal') {
            document.getElementById('phrase-viewer-modal').style.display = 'none';
        }
    });
    
    // Восстановление заметки
    document.getElementById('recover-note-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('recover-note-modal');
        const noteId = modal.dataset.noteId;
        const oldPassword = document.getElementById('recover-password-input').value;
        if (oldPassword) {
            recoverNote(noteId, oldPassword);
        } else {
            showToast('Введите старый пароль', 'warning');
        }
    });
    
    document.getElementById('cancel-recover-btn')?.addEventListener('click', () => {
        document.getElementById('recover-note-modal').style.display = 'none';
        document.getElementById('recover-password-input').value = '';
    });
    
    document.getElementById('recover-password-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('recover-note-btn').click();
        }
    });
    
    document.getElementById('recover-note-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'recover-note-modal') {
            document.getElementById('recover-note-modal').style.display = 'none';
        }
    });
    
    // Обработчики для TODO
    document.getElementById('global-todo-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTodo('global');
        }
    });
    
    document.getElementById('note-todo-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTodo('note');
        }
    });
    
    // Связанные заметки
    document.getElementById('note-links-btn')?.addEventListener('click', toggleLinksSelector);
    document.getElementById('note-links-search')?.addEventListener('input', handleLinksSearch);
    
    // Переход на главную
    document.getElementById('home-btn')?.addEventListener('click', () => {
        window.location.href = '/home';
    });
    
    // Закрытие селектора связей при клике вне
    document.addEventListener('click', (e) => {
        const selector = document.getElementById('note-links-selector');
        const btn = document.getElementById('note-links-btn');
        if (selector && !selector.contains(e.target) && !btn?.contains(e.target)) {
            selector.style.display = 'none';
        }
    });
    
    // Инициализация привязки даты к заметке
    initDateLinkHandlers();
}

// Обработка инициализации
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
    
    if (password.length < 6) {
        errorDiv.textContent = 'Пароль должен быть не менее 6 символов';
        return;
    }
    
    try {
        const response = await fetch('/api/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showApp();
            loadNotes();
        } else {
            errorDiv.textContent = data.error || 'Ошибка инициализации';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка подключения к серверу';
    }
}

// Обработка входа
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
        
        if (response.ok) {
            showApp();
            loadNotes();
            document.getElementById('login-password').value = '';
        } else {
            errorDiv.textContent = data.error || 'Неверный пароль';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка подключения к серверу';
    }
}

// Обработка выхода
async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        currentNoteId = null;
        showLogin();
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

// Загрузка списка заметок
async function loadNotes() {
    try {
        const response = await fetch('/api/notes');
        const data = await response.json();
        
        if (response.ok) {
            notesList = data.notes || [];
            renderNotesList(notesList);
            renderAllTags();
            updateStats();
        } else {
            console.error('Ошибка загрузки списка заметок:', data.error || 'Неизвестная ошибка');
            if (response.status === 401) {
                showLogin();
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки заметок:', error);
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// Отображение списка заметок
function renderNotesList(notes) {
    const notesListDiv = document.getElementById('notes-list');
    notesListDiv.innerHTML = '';
    
    if (notes.length === 0) {
        notesListDiv.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Нет заметок</div>';
        return;
    }
    
    notes.forEach(note => {
        const noteItem = document.createElement('div');
        noteItem.className = 'note-item';
        if (note.id === currentNoteId) {
            noteItem.classList.add('active');
        }
        
        const tagsHtml = note.tags && note.tags.length > 0 
            ? `<div class="note-item-tags">${note.tags.map(t => `<span class="note-item-tag">${escapeHtml(t)}</span>`).join('')}</div>`
            : '';
        
        noteItem.innerHTML = `
            <div class="note-item-title">${escapeHtml(note.title)}</div>
            ${tagsHtml}
            <div class="note-item-date">${formatDate(note.modified)}</div>
        `;
        
        noteItem.addEventListener('click', () => loadNote(note.id));
        
        // Контекстное меню для удаления
        noteItem.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (confirm(`Удалить заметку "${note.title}"?`)) {
                deleteNote(note.id);
            }
        });
        
        notesListDiv.appendChild(noteItem);
    });
}

// Загрузка заметки
async function loadNote(noteId) {
    try {
        const response = await fetch(`/api/notes/${noteId}`);
        const data = await response.json();
        
        if (response.ok && data.note) {
            currentNoteId = noteId;
            currentNoteType = data.note.type || 'text';
            document.getElementById('note-title').value = data.note.title || '';
            
            // Показываем соответствующий редактор
            if (currentNoteType === 'canvas') {
                showCanvasEditor();
                if (canvasEditor) {
                    canvasEditor.setData(data.note.content || '{}');
                    // Обновляем статистику после загрузки данных canvas
                    setTimeout(() => updateStats(), 100);
                }
            } else if (currentNoteType === 'kanban') {
                showKanbanEditor();
                if (kanbanEditor) {
                    kanbanEditor.setData(data.note.content || '{}');
                    // Обновляем статистику после загрузки данных kanban
                    setTimeout(() => updateStats(), 100);
                }
            } else {
                showTextEditor();
                document.getElementById('note-editor').value = data.note.content || '';
                updatePreview();
            }
            
            currentTags = data.note.tags || [];
            document.getElementById('note-tags-input').value = currentTags.join(', ');
            renderNoteTags(currentTags);
            renderNotesList(notesList);
            updateStats();
            switchTab('edit');
            
            // Загружаем TODO только для markdown заметок
            if (currentNoteType === 'text') {
                await loadNoteTodos(noteId);
                // Показываем панели TODO
                document.getElementById('todo-panels-container').style.display = 'flex';
            } else {
                // Скрываем панели TODO для canvas и kanban заметок
                document.getElementById('todo-panels-container').style.display = 'none';
                noteTodos = [];
                renderTodos('note', []);
            }
            
            // Загружаем связи заметки
            await loadNoteLinks(noteId);
            
            // Загружаем привязанную дату
            await loadNoteLinkedDate(noteId);
        } else if (response.status === 403 && data.needs_old_password) {
            // Нужен старый пароль для восстановления
            showRecoverNoteModal(noteId, data.message || 'Введите старый пароль для восстановления доступа');
        } else {
            console.error('Ошибка загрузки заметки:', data.error || 'Неизвестная ошибка');
            showToast(data.error || 'Неизвестная ошибка', 'error', 'Ошибка загрузки');
        }
    } catch (error) {
        console.error('Ошибка загрузки заметки:', error);
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// Восстановление заметки со старым паролем
async function recoverNote(noteId, oldPassword) {
    try {
        const response = await fetch(`/api/notes/${noteId}/recover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password: oldPassword })
        });
        
        const data = await response.json();
        
        if (response.ok && data.note) {
            showToast(data.message || 'Заметка восстановлена', 'success');
            // Закрываем модальное окно
            document.getElementById('recover-note-modal').style.display = 'none';
            document.getElementById('recover-password-input').value = '';
            // Загружаем заметку
            await loadNote(noteId);
        } else {
            showToast(data.error || 'Ошибка восстановления', 'error');
        }
    } catch (error) {
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// Показать модальное окно восстановления
function showRecoverNoteModal(noteId, message) {
    document.getElementById('recover-note-message').textContent = message;
    document.getElementById('recover-note-modal').style.display = 'flex';
    document.getElementById('recover-password-input').focus();
    
    // Сохраняем ID заметки для восстановления
    document.getElementById('recover-note-modal').dataset.noteId = noteId;
}

// Создание заметки
async function handleCreateNote() {
    const title = document.getElementById('new-note-title').value.trim();
    const noteType = document.getElementById('new-note-type')?.value || 'text';
    
        if (!title) {
            showToast('Введите название заметки', 'warning');
            return;
        }
        
        try {
            let content = '';
            if (noteType === 'canvas') {
                content = JSON.stringify({ nodes: [], edges: [], drawings: [], images: [] });
            } else if (noteType === 'kanban') {
                content = JSON.stringify({ columns: ['backlog', 'progress', 'done'], cards: [] });
            }
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content: content, tags: [], type: noteType })
            });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('new-note-modal').style.display = 'none';
            document.getElementById('new-note-title').value = '';
            showToast('Заметка создана', 'success');
            await loadNotes();
            if (data.note) {
                loadNote(data.note.id);
            }
        } else {
            showToast(data.error || 'Ошибка создания заметки', 'error');
        }
    } catch (error) {
        alert('Ошибка подключения к серверу');
    }
}

// Удаление заметки
async function deleteNote(noteId) {
    try {
        const response = await fetch(`/api/notes/${noteId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            if (currentNoteId === noteId) {
                currentNoteId = null;
                document.getElementById('note-title').value = '';
                document.getElementById('note-editor').value = '';
                document.getElementById('note-tags-input').value = '';
                currentTags = [];
                renderNoteTags([]);
                updatePreview();
                updateStats();
                // Скрываем панели TODO
                document.getElementById('todo-panels-container').style.display = 'none';
                noteTodos = [];
                renderTodos('note', []);
            }
            showToast('Заметка удалена', 'success');
            await loadNotes();
        }
    } catch (error) {
        console.error('Ошибка удаления заметки:', error);
    }
}

// Поиск
let searchTimeout = null;
async function handleSearch() {
    const query = document.getElementById('search-input').value.trim();
    
    clearTimeout(searchTimeout);
    
    if (!query) {
        renderNotesList(notesList);
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (response.ok) {
                renderNotesList(data.notes || []);
            }
        } catch (error) {
            console.error('Ошибка поиска:', error);
        }
    }, 300);
}

// Изменение заголовка
function handleTitleChange() {
    if (currentNoteId) {
        scheduleAutoSave();
    }
}

// Изменение содержимого редактора
function handleEditorChange() {
    if (currentNoteType === 'canvas' && canvasEditor) {
        scheduleAutoSave();
    } else {
        updatePreview();
        if (currentNoteId) {
            scheduleAutoSave();
        }
    }
}

// Автосохранение
function scheduleAutoSave() {
    const saveStatus = document.getElementById('save-status');
    saveStatus.textContent = 'Сохранение...';
    saveStatus.className = 'save-status saving';
    
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        autoSave();
    }, 2000);
}

// Автосохранение заметки
async function autoSave() {
    if (!currentNoteId) return;
    
        const title = document.getElementById('note-title').value.trim();
        let content = '';
        if (currentNoteType === 'canvas' && canvasEditor) {
            content = canvasEditor.getData();
        } else if (currentNoteType === 'kanban' && kanbanEditor) {
            content = kanbanEditor.getData();
        } else {
            content = document.getElementById('note-editor').value;
        }
        const tags = currentTags;
        
        try {
            const response = await fetch(`/api/notes/${currentNoteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content, tags })
            });
        
            const saveStatus = document.getElementById('save-status');
        if (response.ok) {
            saveStatus.textContent = 'Сохранено';
            saveStatus.className = 'save-status saved';
            setTimeout(() => {
                saveStatus.textContent = 'Сохранено';
                saveStatus.className = 'save-status';
            }, 2000);
            updateStats();
            await loadNotes();
        } else {
            saveStatus.textContent = 'Ошибка сохранения';
            saveStatus.className = 'save-status';
            showToast('Ошибка сохранения', 'error');
        }
    } catch (error) {
        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = 'Ошибка подключения';
        saveStatus.className = 'save-status';
    }
}

// Переключение вкладок
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        }
    });
    
    if (tab === 'edit') {
        document.getElementById('note-editor').style.display = 'block';
        document.getElementById('note-preview').classList.remove('active');
    } else {
        document.getElementById('note-editor').style.display = 'none';
        document.getElementById('note-preview').classList.add('active');
        updatePreview();
    }
}

// Обновление preview
function updatePreview() {
    const content = document.getElementById('note-editor').value;
    const preview = document.getElementById('note-preview');
    
    if (typeof marked !== 'undefined') {
        let html = marked.parse(content);
        
        // Обрабатываем wiki-ссылки [[фраза]]
        html = processWikiLinks(html);
        
        // Делаем внешние ссылки открывающимися в новой вкладке
        html = html.replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"');
        
        preview.innerHTML = html;
        
        // Подсветка синтаксиса для блоков кода
        if (typeof Prism !== 'undefined') {
            const codeBlocks = preview.querySelectorAll('pre code');
            codeBlocks.forEach(block => {
                Prism.highlightElement(block);
            });
        }
    } else {
        preview.textContent = content;
    }
}

// Вставка markdown разметки
function insertMarkdown(before, after) {
    const editor = document.getElementById('note-editor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selectedText = text.substring(start, end);
    
    const newText = before + selectedText + after;
    editor.value = text.substring(0, start) + newText + text.substring(end);
    
    editor.focus();
    editor.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    
    handleEditorChange();
}

// Форматирование даты
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
        return 'Сегодня';
    } else if (days === 1) {
        return 'Вчера';
    } else if (days < 7) {
        return `${days} дн. назад`;
    } else {
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== ФУНКЦИИ СЛОВАРЯ ==========

// Открыть словарь
async function openDictionary() {
    document.getElementById('dictionary-modal').style.display = 'flex';
    await loadDictionary();
}

// Загрузить словарь
async function loadDictionary() {
    try {
        const response = await fetch('/api/dictionary');
        const data = await response.json();
        
        if (response.ok) {
            renderDictionaryList(data.phrases || []);
        } else {
            console.error('Ошибка загрузки словаря:', data.error);
        }
    } catch (error) {
        console.error('Ошибка загрузки словаря:', error);
    }
}

// Отобразить список фраз
function renderDictionaryList(phrases) {
    const listDiv = document.getElementById('dictionary-list');
    listDiv.innerHTML = '';
    
    if (phrases.length === 0) {
        listDiv.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Словарь пуст</div>';
        return;
    }
    
    phrases.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'dictionary-item';
        const escapedPhrase = escapeHtml(item.phrase);
        const escapedValue = escapeHtml(item.value).replace(/'/g, "\\'");
        itemDiv.innerHTML = `
            <div class="dictionary-item-phrase">${escapedPhrase}</div>
            <div class="dictionary-item-value">${escapeHtml(item.value)}</div>
            <div class="dictionary-item-actions">
                <button class="btn-secondary" onclick="editPhrase('${escapedPhrase.replace(/'/g, "\\'")}', '${escapedValue}')">✏️</button>
                <button class="btn-secondary" onclick="deletePhraseFromDict('${escapedPhrase.replace(/'/g, "\\'")}')">🗑️</button>
            </div>
        `;
        listDiv.appendChild(itemDiv);
    });
}

// Редактировать фразу
function editPhrase(phrase, value) {
    document.getElementById('dict-phrase-input').value = phrase;
    document.getElementById('dict-value-input').value = value;
}

// Удалить фразу из словаря
async function deletePhraseFromDict(phrase) {
    if (!confirm(`Удалить фразу "${phrase}"?`)) {
        return;
    }
    
    try {
        const encodedPhrase = encodeURIComponent(phrase);
        const response = await fetch(`/api/dictionary/${encodedPhrase}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadDictionary();
        } else {
            const data = await response.json();
            showToast(data.error || 'Неизвестная ошибка', 'error', 'Ошибка удаления');
        }
    } catch (error) {
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// Добавить/обновить фразу
async function handleAddPhrase() {
    const phrase = document.getElementById('dict-phrase-input').value.trim();
    const value = document.getElementById('dict-value-input').value.trim();
    
    if (!phrase) {
        showToast('Введите фразу', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/dictionary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phrase, value })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('dict-phrase-input').value = '';
            document.getElementById('dict-value-input').value = '';
            await loadDictionary();
        } else {
            showToast(data.error || 'Неизвестная ошибка', 'error', 'Ошибка сохранения');
        }
    } catch (error) {
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// Вставить фразу в редактор
async function handleInsertPhrase() {
    const editor = document.getElementById('note-editor');
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    
    // Если есть выделенный текст, используем его как отображаемый текст
    let displayText = selectedText.trim();
    let phrase = '';
    
    // Получаем список фраз из словаря
    try {
        const response = await fetch('/api/dictionary');
        const data = await response.json();
        
        if (response.ok && data.phrases && data.phrases.length > 0) {
            const phrases = data.phrases.map(p => p.phrase);
            
            if (displayText) {
                // Если есть выделенный текст, спрашиваем только ключ фразы
                phrase = prompt(`Введите ключ фразы из словаря (отображаемый текст: "${displayText}"):\n\nДоступные фразы:\n${phrases.join('\n')}`);
            } else {
                // Если нет выделенного текста, спрашиваем и ключ, и отображаемый текст
                phrase = prompt(`Введите ключ фразы из словаря:\n\nДоступные фразы:\n${phrases.join('\n')}`);
                if (phrase) {
                    displayText = prompt(`Введите отображаемый текст (или оставьте пустым для использования ключа):`);
                    if (displayText === null) return; // Пользователь отменил
                    if (!displayText.trim()) {
                        displayText = phrase;
                    }
                }
            }
            
            if (!phrase) {
                return; // Пользователь отменил
            }
        } else {
            // Словарь пуст, просто спрашиваем фразу
            phrase = prompt('Введите фразу для вставки:');
            if (!phrase) return;
            if (!displayText) {
                displayText = phrase;
            }
        }
    } catch (error) {
        phrase = prompt('Введите фразу для вставки:');
        if (!phrase) return;
        if (!displayText) {
            displayText = phrase;
        }
    }
    
    // Вставляем в формате [[фраза|текст]] или [[фраза]]
    let wikiLink;
    if (displayText && displayText !== phrase) {
        wikiLink = `[[${phrase}|${displayText}]]`;
    } else {
        wikiLink = `[[${phrase}]]`;
    }
    
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    
    editor.value = text.substring(0, start) + wikiLink + text.substring(end);
    editor.focus();
    editor.setSelectionRange(start + wikiLink.length, start + wikiLink.length);
    
    handleEditorChange();
}

// Просмотр значения фразы
async function viewPhrase(phrase) {
    try {
        const encodedPhrase = encodeURIComponent(phrase);
        const response = await fetch(`/api/dictionary/${encodedPhrase}`);
        const data = await response.json();
        
        if (response.ok && data.value) {
            document.getElementById('phrase-viewer-title').textContent = `📖 ${phrase}`;
            document.getElementById('phrase-viewer-content').textContent = data.value;
            document.getElementById('phrase-viewer-modal').style.display = 'flex';
        } else {
            showToast('Фраза не найдена в словаре', 'warning');
        }
    } catch (error) {
        showToast('Ошибка загрузки значения', 'error');
    }
}

// Обработка wiki-ссылок в markdown
function processWikiLinks(html) {
    // Находим все [[фраза]] или [[фраза|текст]] и заменяем на кликабельные ссылки
    const wikiLinkRegex = /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]/g;
    return html.replace(wikiLinkRegex, (match, phrase, displayText) => {
        const phraseKey = phrase.trim();
        const display = displayText ? displayText.trim() : phraseKey;
        const escapedPhrase = escapeHtml(phraseKey);
        const escapedDisplay = escapeHtml(display);
        return `<span class="wiki-link" onclick="viewPhrase('${escapedPhrase.replace(/'/g, "\\'")}')">${escapedDisplay}</span>`;
    });
}

// ========== TOAST УВЕДОМЛЕНИЯ ==========

function showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // Автоматическое удаление через 5 секунд
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'toastSlideIn 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

// ========== СТАТИСТИКА ==========

function updateStats() {
    const notesCount = notesList.length;
    let value = 0;
    let label = 'Слов';
    
    if (currentNoteId) {
        if (currentNoteType === 'canvas' && canvasEditor) {
            // Для canvas считаем блоки
            value = canvasEditor.nodes ? canvasEditor.nodes.length : 0;
            label = 'Блоков';
        } else if (currentNoteType === 'kanban' && kanbanEditor) {
            // Для kanban считаем карточки
            value = kanbanEditor.cards ? kanbanEditor.cards.length : 0;
            label = 'Задач';
        } else {
            // Для текстовых заметок считаем слова
            const editor = document.getElementById('note-editor');
            if (editor) {
                const content = editor.value;
                value = content.trim().split(/\s+/).filter(w => w.length > 0).length;
            }
            label = 'Слов';
        }
    }
    
    document.getElementById('notes-count').textContent = notesCount;
    const wordsCountEl = document.getElementById('words-count');
    const wordsLabelEl = document.getElementById('words-count-label');
    if (wordsCountEl) {
        wordsCountEl.textContent = value;
    }
    if (wordsLabelEl) {
        wordsLabelEl.textContent = label;
    }
}

// ========== ТЕГИ ==========

let currentTags = [];
let activeTagFilter = null;

function parseTags(tagString) {
    if (!tagString) return [];
    return tagString.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

function renderNoteTags(tags) {
    const container = document.getElementById('note-tags-display');
    container.innerHTML = '';
    
    tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'note-tag';
        tagEl.innerHTML = `
            ${escapeHtml(tag)}
            <span class="tag-remove" onclick="removeTag('${escapeHtml(tag).replace(/'/g, "\\'")}')">×</span>
        `;
        container.appendChild(tagEl);
    });
}

function removeTag(tag) {
    currentTags = currentTags.filter(t => t !== tag);
    document.getElementById('note-tags-input').value = currentTags.join(', ');
    renderNoteTags(currentTags);
    scheduleAutoSave();
}

function updateTagsInput() {
    const input = document.getElementById('note-tags-input');
    const value = input.value;
    currentTags = parseTags(value);
    renderNoteTags(currentTags);
    scheduleAutoSave();
}

function renderAllTags() {
    const allTags = new Set();
    notesList.forEach(note => {
        if (note.tags) {
            note.tags.forEach(tag => allTags.add(tag));
        }
    });
    
    const container = document.getElementById('tags-list');
    container.innerHTML = '';
    
    if (allTags.size === 0) {
        document.getElementById('tags-container').style.display = 'none';
        return;
    }
    
    document.getElementById('tags-container').style.display = 'block';
    
    Array.from(allTags).sort().forEach(tag => {
        const count = notesList.filter(n => n.tags && n.tags.includes(tag)).length;
        const tagEl = document.createElement('span');
        tagEl.className = `tag-item ${activeTagFilter === tag ? 'active' : ''}`;
        tagEl.innerHTML = `
            ${escapeHtml(tag)}
            <span class="tag-count">${count}</span>
        `;
        tagEl.onclick = () => filterByTag(tag);
        container.appendChild(tagEl);
    });
}

function filterByTag(tag) {
    if (activeTagFilter === tag) {
        activeTagFilter = null;
        renderNotesList(notesList);
    } else {
        activeTagFilter = tag;
        const filtered = notesList.filter(n => n.tags && n.tags.includes(tag));
        renderNotesList(filtered);
    }
    renderAllTags();
}

// ========== ЭКСПОРТ ==========

function exportNote() {
    if (!currentNoteId) {
        showToast('Откройте заметку для экспорта', 'warning');
        return;
    }
    
    const title = document.getElementById('note-title').value || 'Untitled';
    const content = document.getElementById('note-editor').value;
    const tags = currentTags.length > 0 ? `\n\nТеги: ${currentTags.join(', ')}` : '';
    
    const text = `# ${title}${tags}\n\n${content}`;
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Заметка экспортирована', 'success');
}

// ========== КОПИРОВАНИЕ ЗАМЕТКИ ==========

async function duplicateNote() {
    if (!currentNoteId) {
        showToast('Откройте заметку для копирования', 'warning');
        return;
    }
    
    try {
        const title = document.getElementById('note-title').value || 'Untitled';
        const content = document.getElementById('note-editor').value;
        const tags = currentTags;
        
        const response = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title: `${title} (копия)`, 
                content: content, 
                tags: [...tags] 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Заметка скопирована', 'success');
            await loadNotes();
            if (data.note) {
                loadNote(data.note.id);
            }
        } else {
            showToast(data.error || 'Ошибка копирования заметки', 'error');
        }
    } catch (error) {
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// ========== СЛУЧАЙНАЯ ЗАМЕТКА ==========

function loadRandomNote() {
    if (notesList.length === 0) {
        showToast('Нет заметок для отображения', 'warning');
        return;
    }
    
    const randomIndex = Math.floor(Math.random() * notesList.length);
    const randomNote = notesList[randomIndex];
    loadNote(randomNote.id);
    showToast('Загружена случайная заметка', 'info');
}

// ========== СМЕНА ПАРОЛЯ ==========

async function handleChangePassword() {
    const oldPassword = document.getElementById('change-password-old').value;
    const newPassword = document.getElementById('change-password-new').value;
    const newPasswordConfirm = document.getElementById('change-password-confirm').value;
    const errorDiv = document.getElementById('change-password-error');
    
    errorDiv.textContent = '';
    
    if (!oldPassword || !newPassword || !newPasswordConfirm) {
        errorDiv.textContent = 'Заполните все поля';
        return;
    }
    
    if (newPassword !== newPasswordConfirm) {
        errorDiv.textContent = 'Новые пароли не совпадают';
        return;
    }
    
    if (newPassword.length < 6) {
        errorDiv.textContent = 'Новый пароль должен быть не менее 6 символов';
        return;
    }
    
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('change-password-modal').style.display = 'none';
            document.getElementById('change-password-old').value = '';
            document.getElementById('change-password-new').value = '';
            document.getElementById('change-password-confirm').value = '';
            showToast('Пароль успешно изменен', 'success');
        } else {
            errorDiv.textContent = data.error || 'Ошибка смены пароля';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка подключения к серверу';
    }
}

function openChangePasswordModal() {
    document.getElementById('change-password-modal').style.display = 'flex';
    document.getElementById('change-password-old').focus();
}

// ========== TODO ФУНКЦИОНАЛЬНОСТЬ ==========

let globalTodos = [];
let noteTodos = [];

// Загрузка глобального TODO
async function loadGlobalTodos() {
    try {
        const response = await fetch('/api/todos/global');
        const data = await response.json();
        
        if (response.ok) {
            globalTodos = data.todos || [];
            renderTodos('global', globalTodos);
        } else {
            console.error('Ошибка загрузки глобального TODO:', data.error);
        }
    } catch (error) {
        console.error('Ошибка загрузки глобального TODO:', error);
    }
}

// Загрузка TODO для заметки
async function loadNoteTodos(noteId) {
    if (!noteId) {
        noteTodos = [];
        renderTodos('note', []);
        return;
    }
    
    try {
        const response = await fetch(`/api/todos/note/${noteId}`);
        const data = await response.json();
        
        if (response.ok) {
            noteTodos = data.todos || [];
            renderTodos('note', noteTodos);
        } else {
            console.error('Ошибка загрузки TODO заметки:', data.error);
            noteTodos = [];
            renderTodos('note', []);
        }
    } catch (error) {
        console.error('Ошибка загрузки TODO заметки:', error);
        noteTodos = [];
        renderTodos('note', []);
    }
}

// Сохранение глобального TODO
async function saveGlobalTodos() {
    try {
        const response = await fetch('/api/todos/global', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ todos: globalTodos })
        });
        
        if (!response.ok) {
            const data = await response.json();
            console.error('Ошибка сохранения глобального TODO:', data.error);
            showToast('Ошибка сохранения глобального TODO', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения глобального TODO:', error);
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// Сохранение TODO заметки
async function saveNoteTodos() {
    if (!currentNoteId) return;
    
    try {
        const response = await fetch(`/api/todos/note/${currentNoteId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ todos: noteTodos })
        });
        
        if (!response.ok) {
            const data = await response.json();
            console.error('Ошибка сохранения TODO заметки:', data.error);
            showToast('Ошибка сохранения TODO заметки', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения TODO заметки:', error);
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// Переключение видимости панели
function toggleTodoPanel(panelType) {
    const panel = document.getElementById(`${panelType}-todo-panel`);
    const arrow = panel.querySelector('.todo-arrow');
    
    if (panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        panel.classList.add('expanded');
        arrow.textContent = '▶'; // Стрелка вправо - закрыть (вернуть в угол)
    } else {
        panel.classList.remove('expanded');
        panel.classList.add('collapsed');
        arrow.textContent = '◀'; // Стрелка влево - открыть (выехать влево)
    }
}

// Добавление задачи
async function addTodo(panelType) {
    const input = document.getElementById(`${panelType}-todo-input`);
    const text = input.value.trim();
    
    if (!text) {
        showToast('Введите текст задачи', 'warning');
        return;
    }
    
    const todo = {
        id: generateTodoId(),
        text: text,
        completed: false,
        created: new Date().toISOString(),
        modified: new Date().toISOString()
    };
    
    if (panelType === 'global') {
        globalTodos.push(todo);
        await saveGlobalTodos();
    } else {
        if (!currentNoteId) {
            showToast('Откройте заметку для добавления задач', 'warning');
            return;
        }
        noteTodos.push(todo);
        await saveNoteTodos();
    }
    
    input.value = '';
    renderTodos(panelType, panelType === 'global' ? globalTodos : noteTodos);
}

// Обновление задачи
async function updateTodo(panelType, todoId, updates) {
    const todos = panelType === 'global' ? globalTodos : noteTodos;
    const todo = todos.find(t => t.id === todoId);
    
    if (!todo) {
        console.error('Задача не найдена');
        return;
    }
    
    Object.assign(todo, updates);
    todo.modified = new Date().toISOString();
    
    if (panelType === 'global') {
        try {
            const response = await fetch(`/api/todos/global/${todoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            
            if (!response.ok) {
                const data = await response.json();
                console.error('Ошибка обновления задачи:', data.error);
                showToast('Ошибка обновления задачи', 'error');
            }
        } catch (error) {
            console.error('Ошибка обновления задачи:', error);
            showToast('Ошибка подключения к серверу', 'error');
        }
    } else {
        if (!currentNoteId) return;
        
        try {
            const response = await fetch(`/api/todos/note/${currentNoteId}/${todoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            
            if (!response.ok) {
                const data = await response.json();
                console.error('Ошибка обновления задачи:', data.error);
                showToast('Ошибка обновления задачи', 'error');
            }
        } catch (error) {
            console.error('Ошибка обновления задачи:', error);
            showToast('Ошибка подключения к серверу', 'error');
        }
    }
    
    renderTodos(panelType, todos);
}

// Удаление задачи
async function deleteTodo(panelType, todoId) {
    if (!confirm('Удалить задачу?')) {
        return;
    }
    
    const todos = panelType === 'global' ? globalTodos : noteTodos;
    const index = todos.findIndex(t => t.id === todoId);
    
    if (index === -1) {
        console.error('Задача не найдена');
        return;
    }
    
    todos.splice(index, 1);
    
    if (panelType === 'global') {
        try {
            const response = await fetch(`/api/todos/global/${todoId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const data = await response.json();
                console.error('Ошибка удаления задачи:', data.error);
                showToast('Ошибка удаления задачи', 'error');
                // Восстанавливаем задачу при ошибке
                todos.splice(index, 0, todos[index]);
                return;
            }
        } catch (error) {
            console.error('Ошибка удаления задачи:', error);
            showToast('Ошибка подключения к серверу', 'error');
            todos.splice(index, 0, todos[index]);
            return;
        }
    } else {
        if (!currentNoteId) return;
        
        try {
            const response = await fetch(`/api/todos/note/${currentNoteId}/${todoId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const data = await response.json();
                console.error('Ошибка удаления задачи:', data.error);
                showToast('Ошибка удаления задачи', 'error');
                todos.splice(index, 0, todos[index]);
                return;
            }
        } catch (error) {
            console.error('Ошибка удаления задачи:', error);
            showToast('Ошибка подключения к серверу', 'error');
            todos.splice(index, 0, todos[index]);
            return;
        }
    }
    
    renderTodos(panelType, todos);
}

// Редактирование задачи
function editTodo(panelType, todoId) {
    const todos = panelType === 'global' ? globalTodos : noteTodos;
    const todo = todos.find(t => t.id === todoId);
    
    if (!todo) return;
    
    const newText = prompt('Изменить задачу:', todo.text);
    if (newText === null) return; // Пользователь отменил
    
    const trimmedText = newText.trim();
    if (!trimmedText) {
        showToast('Текст задачи не может быть пустым', 'warning');
        return;
    }
    
    updateTodo(panelType, todoId, { text: trimmedText });
}

// Отрисовка списка задач
function renderTodos(panelType, todos) {
    const list = document.getElementById(`${panelType}-todo-list`);
    list.innerHTML = '';
    
    if (todos.length === 0) {
        list.innerHTML = '<div class="todo-empty">Нет задач</div>';
        return;
    }
    
    todos.forEach(todo => {
        const item = document.createElement('div');
        item.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        item.innerHTML = `
            <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                   onchange="toggleTodoComplete('${panelType}', '${todo.id}')" 
                   class="todo-checkbox">
            <span class="todo-text" ondblclick="editTodo('${panelType}', '${todo.id}')">${escapeHtml(todo.text)}</span>
            <div class="todo-actions">
                <button class="todo-action-btn" onclick="editTodo('${panelType}', '${todo.id}')" title="Редактировать">✏️</button>
                <button class="todo-action-btn" onclick="deleteTodo('${panelType}', '${todo.id}')" title="Удалить">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

// Переключение выполнения задачи
function toggleTodoComplete(panelType, todoId) {
    const todos = panelType === 'global' ? globalTodos : noteTodos;
    const todo = todos.find(t => t.id === todoId);
    
    if (!todo) return;
    
    todo.completed = !todo.completed;
    updateTodo(panelType, todoId, { completed: todo.completed });
}

// Генерация ID для задачи
function generateTodoId() {
    return 'todo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ========== ФУНКЦИИ ДЛЯ РАБОТЫ СО СВЯЗЯМИ ЗАМЕТОК ==========

// Загрузка связей заметки
async function loadNoteLinks(noteId) {
    if (!noteId) {
        currentNoteLinks = [];
        renderNoteLinks([]);
        return;
    }
    
    try {
        const response = await fetch(`/api/notes/${noteId}/links`);
        const data = await response.json();
        
        if (response.ok) {
            currentNoteLinks = data.links || [];
            renderNoteLinks(currentNoteLinks);
        } else {
            console.error('Ошибка загрузки связей:', data.error);
            currentNoteLinks = [];
            renderNoteLinks([]);
        }
    } catch (error) {
        console.error('Ошибка загрузки связей:', error);
        currentNoteLinks = [];
        renderNoteLinks([]);
    }
}

// Отображение связей заметки
function renderNoteLinks(links) {
    const display = document.getElementById('note-links-display');
    if (!display) return;
    
    display.innerHTML = '';
    
    if (links.length === 0) {
        return;
    }
    
    links.forEach(linkId => {
        const note = notesList.find(n => n.id === linkId);
        if (!note) return;
        
        const chip = document.createElement('span');
        chip.className = 'note-link-chip';
        chip.textContent = note.title;
        chip.title = note.title;
        chip.addEventListener('click', () => loadNote(linkId));
        
        const removeBtn = document.createElement('span');
        removeBtn.className = 'note-link-remove';
        removeBtn.textContent = '×';
        removeBtn.title = 'Удалить связь';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeNoteLink(linkId);
        });
        
        chip.appendChild(removeBtn);
        display.appendChild(chip);
    });
}

// Переключение селектора связей
function toggleLinksSelector() {
    const panel = document.getElementById('note-links-panel');
    const selector = document.getElementById('note-links-selector');
    if (!panel || !selector) return;
    
    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'block';
        selector.style.display = 'block';
        document.getElementById('note-links-search').focus();
        populateLinksList();
    } else {
        panel.style.display = 'none';
        selector.style.display = 'none';
    }
}

// Поиск заметок для связывания
function handleLinksSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    populateLinksList(query);
}

// Заполнение списка заметок для выбора
function populateLinksList(query = '') {
    const list = document.getElementById('note-links-list');
    if (!list) return;
    
    // Фильтруем заметки (исключаем текущую и уже связанные)
    let availableNotes = notesList.filter(note => 
        note.id !== currentNoteId && 
        !currentNoteLinks.includes(note.id) &&
        (query === '' || note.title.toLowerCase().includes(query))
    );
    
    if (availableNotes.length === 0) {
        list.innerHTML = '<div class="note-links-empty">Нет доступных заметок</div>';
        return;
    }
    
    list.innerHTML = '';
    
    availableNotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'note-links-item';
        item.textContent = note.title;
        item.addEventListener('click', () => {
            addNoteLink(note.id);
            document.getElementById('note-links-search').value = '';
            populateLinksList();
        });
        list.appendChild(item);
    });
}

// Добавление связи
async function addNoteLink(linkId) {
    if (!currentNoteId) return;
    
    if (currentNoteLinks.includes(linkId)) {
        return; // Уже связана
    }
    
    currentNoteLinks.push(linkId);
    renderNoteLinks(currentNoteLinks);
    await saveNoteLinks();
}

// Удаление связи
async function removeNoteLink(linkId) {
    if (!currentNoteId) return;
    
    currentNoteLinks = currentNoteLinks.filter(id => id !== linkId);
    renderNoteLinks(currentNoteLinks);
    await saveNoteLinks();
}

// Сохранение связей
async function saveNoteLinks() {
    if (!currentNoteId) return;
    
    try {
        const response = await fetch(`/api/notes/${currentNoteId}/links`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ links: currentNoteLinks })
        });
        
        if (!response.ok) {
            const data = await response.json();
            console.error('Ошибка сохранения связей:', data.error);
            showToast('Ошибка сохранения связей', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения связей:', error);
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// ========== ПРИВЯЗКА ДАТЫ К ЗАМЕТКЕ ==========

let currentNoteLinkedDate = null;

// Загрузка привязанной даты заметки
async function loadNoteLinkedDate(noteId) {
    const linkedDateSpan = document.getElementById('note-linked-date');
    const unlinkBtn = document.getElementById('note-date-unlink-btn');
    const linkBtn = document.getElementById('note-date-link-btn');
    const pickerContainer = document.getElementById('note-date-picker-container');
    
    if (!noteId) {
        currentNoteLinkedDate = null;
        linkedDateSpan.style.display = 'none';
        unlinkBtn.style.display = 'none';
        linkBtn.style.display = 'inline-flex';
        if (pickerContainer) pickerContainer.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`/api/notes/${noteId}/linked-date`);
        const data = await response.json();
        
        if (response.ok && data.date) {
            currentNoteLinkedDate = data.date;
            showLinkedDate(data.date);
        } else {
            currentNoteLinkedDate = null;
            linkedDateSpan.style.display = 'none';
            unlinkBtn.style.display = 'none';
            linkBtn.style.display = 'inline-flex';
            if (pickerContainer) pickerContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка загрузки привязанной даты:', error);
        currentNoteLinkedDate = null;
    }
}

// Отображение привязанной даты
function showLinkedDate(date) {
    const linkedDateSpan = document.getElementById('note-linked-date');
    const unlinkBtn = document.getElementById('note-date-unlink-btn');
    const linkBtn = document.getElementById('note-date-link-btn');
    const pickerContainer = document.getElementById('note-date-picker-container');
    
    const formattedDate = formatDateShort(date);
    linkedDateSpan.textContent = `📅 ${formattedDate}`;
    linkedDateSpan.title = `Привязано к ${date}. Нажмите чтобы открыть в календаре`;
    linkedDateSpan.style.display = 'inline-block';
    linkedDateSpan.style.cursor = 'pointer';
    linkedDateSpan.onclick = () => goToCalendarDate(date);
    
    unlinkBtn.style.display = 'inline-flex';
    linkBtn.style.display = 'none';
    if (pickerContainer) pickerContainer.style.display = 'none';
}

// Форматирование даты коротко
function formatDateShort(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate();
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${day} ${months[date.getMonth()]}`;
}

// Переход к дате в календаре (на главную страницу)
function goToCalendarDate(date) {
    // Сохраняем дату в localStorage чтобы календарь её подсветил
    localStorage.setItem('highlightCalendarDate', date);
    window.location.href = '/home';
}

// Привязка даты к заметке
async function linkNoteToDate(date) {
    if (!currentNoteId) {
        showToast('Сначала откройте заметку', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`/api/notes/${currentNoteId}/link-date`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date })
        });
        
        if (response.ok) {
            currentNoteLinkedDate = date;
            showLinkedDate(date);
            showToast(`Заметка привязана к ${formatDateShort(date)}`, 'success');
        } else {
            const data = await response.json();
            showToast(data.error || 'Ошибка привязки', 'error');
        }
    } catch (error) {
        console.error('Ошибка привязки даты:', error);
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// Отвязка даты от заметки
async function unlinkNoteFromDate() {
    if (!currentNoteId) return;
    
    try {
        const response = await fetch(`/api/notes/${currentNoteId}/unlink-date`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            currentNoteLinkedDate = null;
            document.getElementById('note-linked-date').style.display = 'none';
            document.getElementById('note-date-unlink-btn').style.display = 'none';
            document.getElementById('note-date-link-btn').style.display = 'inline-flex';
            const pickerContainer = document.getElementById('note-date-picker-container');
            if (pickerContainer) pickerContainer.style.display = 'none';
            showToast('Привязка к дате удалена', 'success');
        } else {
            const data = await response.json();
            showToast(data.error || 'Ошибка отвязки', 'error');
        }
    } catch (error) {
        console.error('Ошибка отвязки даты:', error);
        showToast('Ошибка подключения к серверу', 'error');
    }
}

// Инициализация обработчиков для привязки даты
function initDateLinkHandlers() {
    const linkBtn = document.getElementById('note-date-link-btn');
    const unlinkBtn = document.getElementById('note-date-unlink-btn');
    const pickerContainer = document.getElementById('note-date-picker-container');
    const datePicker = document.getElementById('note-date-picker');
    const confirmBtn = document.getElementById('note-date-confirm-btn');
    const cancelBtn = document.getElementById('note-date-cancel-btn');
    
    // Открыть выбор даты
    if (linkBtn) {
        linkBtn.addEventListener('click', () => {
            const isVisible = pickerContainer.style.display !== 'none';
            pickerContainer.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) {
                datePicker.value = new Date().toISOString().split('T')[0];
                datePicker.focus();
            }
        });
    }
    
    // Отвязать дату
    if (unlinkBtn) {
        unlinkBtn.addEventListener('click', () => {
            if (confirm('Отвязать заметку от даты?')) {
                unlinkNoteFromDate();
            }
        });
    }
    
    // Подтвердить выбор даты
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const date = datePicker.value;
            if (date) {
                linkNoteToDate(date);
                pickerContainer.style.display = 'none';
            }
        });
    }
    
    // Отмена выбора даты
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            pickerContainer.style.display = 'none';
        });
    }
    
    // Enter для подтверждения
    if (datePicker) {
        datePicker.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const date = datePicker.value;
                if (date) {
                    linkNoteToDate(date);
                    pickerContainer.style.display = 'none';
                }
            }
        });
    }
}




