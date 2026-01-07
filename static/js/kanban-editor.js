// Kanban Editor для управления задачами
class KanbanEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.columns = {
            backlog: { id: 'backlog', title: 'На рассмотрении', icon: '📋' },
            progress: { id: 'progress', title: 'В работе', icon: '⚙️' },
            done: { id: 'done', title: 'Готово', icon: '✅' }
        };
        this.cards = [];
        this.draggedCard = null;
        this.draggedElement = null;
        this.onChange = null;
        this.boundHandlers = new Map(); // Для хранения привязанных обработчиков
        this.init();
    }
    
    init() {
        this.render();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="kanban-board">
                ${Object.values(this.columns).map(col => this.renderColumn(col)).join('')}
            </div>
        `;
        this.renderAllCards();
        this.setupEventListeners();
    }
    
    renderColumn(column) {
        return `
            <div class="kanban-column" data-column="${column.id}">
                <div class="kanban-column-header">
                    <span class="kanban-column-icon">${column.icon}</span>
                    <span class="kanban-column-title">${column.title}</span>
                    <span class="kanban-column-count" id="count-${column.id}">0</span>
                </div>
                <div class="kanban-cards" id="cards-${column.id}" data-column="${column.id}">
                    <!-- Карточки будут здесь -->
                </div>
                <button class="kanban-add-card-btn" data-column="${column.id}">
                    <span>+</span> Добавить карточку
                </button>
            </div>
        `;
    }
    
    renderAllCards() {
        // Очищаем все колонки
        Object.keys(this.columns).forEach(colId => {
            const container = document.getElementById(`cards-${colId}`);
            if (container) container.innerHTML = '';
        });
        
        // Сортируем карточки по порядку и добавляем в соответствующие колонки
        const sortedCards = [...this.cards].sort((a, b) => (a.order || 0) - (b.order || 0));
        
        sortedCards.forEach(card => {
            const container = document.getElementById(`cards-${card.column}`);
            if (container) {
                container.appendChild(this.createCardElement(card));
            }
        });
        
        // Обновляем счетчики
        this.updateCounts();
    }
    
    createCardElement(card) {
        const cardEl = document.createElement('div');
        cardEl.className = 'kanban-card';
        cardEl.dataset.cardId = card.id;
        cardEl.draggable = true;
        
        const priorityClass = `priority-${card.priority || 'normal'}`;
        const priorityLabels = {
            urgent: { text: 'Срочно', icon: '🔴' },
            normal: { text: 'Обычно', icon: '🟡' },
            later: { text: 'Не сейчас', icon: '⚪' }
        };
        const priority = priorityLabels[card.priority || 'normal'];
        
        const hasDescription = card.description && card.description.trim().length > 0;
        const hasImages = card.images && card.images.length > 0;
        
        cardEl.innerHTML = `
            <div class="kanban-card-header">
                <span class="kanban-card-priority ${priorityClass}" title="${priority.text}">${priority.icon}</span>
                <div class="kanban-card-actions">
                    <button class="kanban-card-btn kanban-expand-btn" title="Развернуть">📝</button>
                    <button class="kanban-card-btn kanban-delete-btn" title="Удалить">🗑️</button>
                </div>
            </div>
            <div class="kanban-card-title">${this.escapeHtml(card.title)}</div>
            ${hasDescription || hasImages ? `
                <div class="kanban-card-indicators">
                    ${hasDescription ? '<span class="kanban-indicator" title="Есть описание">📄</span>' : ''}
                    ${hasImages ? `<span class="kanban-indicator" title="${card.images.length} изображений">🖼️ ${card.images.length}</span>` : ''}
                </div>
            ` : ''}
        `;
        
        // Drag events
        cardEl.addEventListener('dragstart', (e) => this.onDragStart(e, card));
        cardEl.addEventListener('dragend', (e) => this.onDragEnd(e));
        
        // Click events
        cardEl.querySelector('.kanban-expand-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openCardModal(card);
        });
        
        cardEl.querySelector('.kanban-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteCard(card.id);
        });
        
        // Double click to edit title
        cardEl.querySelector('.kanban-card-title').addEventListener('dblclick', () => {
            this.editCardTitle(card, cardEl);
        });
        
        return cardEl;
    }
    
    setupEventListeners() {
        // Удаляем старые обработчики если есть
        this.removeEventListeners();
        
        // Add card buttons - используем делегирование событий
        const boardClickHandler = (e) => {
            const addBtn = e.target.closest('.kanban-add-card-btn');
            if (addBtn) {
                const column = addBtn.dataset.column;
                this.addCard(column);
            }
        };
        
        const board = this.container.querySelector('.kanban-board');
        if (board) {
            board.addEventListener('click', boardClickHandler);
            this.boundHandlers.set('boardClick', { element: board, type: 'click', handler: boardClickHandler });
        }
        
        // Drop zones
        this.container.querySelectorAll('.kanban-cards').forEach(zone => {
            const dragOverHandler = (e) => this.onDragOver(e);
            const dragLeaveHandler = (e) => this.onDragLeave(e);
            const dropHandler = (e) => this.onDrop(e);
            
            zone.addEventListener('dragover', dragOverHandler);
            zone.addEventListener('dragleave', dragLeaveHandler);
            zone.addEventListener('drop', dropHandler);
            
            this.boundHandlers.set(`dragover-${zone.id}`, { element: zone, type: 'dragover', handler: dragOverHandler });
            this.boundHandlers.set(`dragleave-${zone.id}`, { element: zone, type: 'dragleave', handler: dragLeaveHandler });
            this.boundHandlers.set(`drop-${zone.id}`, { element: zone, type: 'drop', handler: dropHandler });
        });
    }
    
    removeEventListeners() {
        this.boundHandlers.forEach((value, key) => {
            value.element.removeEventListener(value.type, value.handler);
        });
        this.boundHandlers.clear();
    }
    
    // Drag and Drop
    onDragStart(e, card) {
        this.draggedCard = card;
        this.draggedElement = e.target;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.id);
    }
    
    onDragEnd(e) {
        e.target.classList.remove('dragging');
        this.container.querySelectorAll('.kanban-cards').forEach(zone => {
            zone.classList.remove('drag-over');
        });
        this.draggedCard = null;
        this.draggedElement = null;
    }
    
    onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
        
        // Определяем позицию для вставки
        const afterElement = this.getDragAfterElement(e.currentTarget, e.clientY);
        const draggable = this.draggedElement;
        
        if (draggable) {
            if (afterElement == null) {
                e.currentTarget.appendChild(draggable);
            } else {
                e.currentTarget.insertBefore(draggable, afterElement);
            }
        }
    }
    
    onDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }
    
    onDrop(e) {
        e.preventDefault();
        const targetColumn = e.currentTarget.dataset.column;
        e.currentTarget.classList.remove('drag-over');
        
        if (this.draggedCard && targetColumn) {
            // Обновляем колонку карточки
            this.draggedCard.column = targetColumn;
            
            // Обновляем порядок всех карточек в этой колонке
            const cardsInColumn = e.currentTarget.querySelectorAll('.kanban-card');
            cardsInColumn.forEach((cardEl, index) => {
                const card = this.cards.find(c => c.id === cardEl.dataset.cardId);
                if (card) {
                    card.order = index;
                }
            });
            
            this.updateCounts();
            this.triggerChange();
        }
    }
    
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    // Card operations
    addCard(column) {
        const title = prompt('Название задачи:');
        if (!title || !title.trim()) return;
        
        const cardsInColumn = this.cards.filter(c => c.column === column);
        const maxOrder = cardsInColumn.length > 0 
            ? Math.max(...cardsInColumn.map(c => c.order || 0)) + 1 
            : 0;
        
        const card = {
            id: 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            column: column,
            title: title.trim(),
            description: '',
            priority: 'normal',
            images: [],
            order: maxOrder,
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };
        
        this.cards.push(card);
        
        // Добавляем только новую карточку, не перерисовываем всё
        const container = document.getElementById(`cards-${column}`);
        if (container) {
            container.appendChild(this.createCardElement(card));
        }
        this.updateCounts();
        this.triggerChange();
    }
    
    deleteCard(cardId) {
        if (!confirm('Удалить эту карточку?')) return;
        
        this.cards = this.cards.filter(c => c.id !== cardId);
        
        // Удаляем элемент из DOM
        const cardEl = this.container.querySelector(`[data-card-id="${cardId}"]`);
        if (cardEl) cardEl.remove();
        
        this.updateCounts();
        this.triggerChange();
    }
    
    editCardTitle(card, cardEl) {
        const titleEl = cardEl.querySelector('.kanban-card-title');
        const currentTitle = card.title;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'kanban-card-title-input';
        
        titleEl.innerHTML = '';
        titleEl.appendChild(input);
        input.focus();
        input.select();
        
        const save = () => {
            const newTitle = input.value.trim();
            if (newTitle && newTitle !== currentTitle) {
                card.title = newTitle;
                card.modified = new Date().toISOString();
                this.triggerChange();
            }
            titleEl.textContent = card.title;
        };
        
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                input.value = currentTitle;
                input.blur();
            }
        });
    }
    
    updateCounts() {
        Object.keys(this.columns).forEach(colId => {
            const count = this.cards.filter(c => c.column === colId).length;
            const countEl = document.getElementById(`count-${colId}`);
            if (countEl) countEl.textContent = count;
        });
    }
    
    // Card Modal
    openCardModal(card) {
        // Удаляем существующий модал если есть
        const existingModal = document.getElementById('kanban-card-modal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'kanban-card-modal';
        modal.className = 'kanban-modal';
        
        const priorityOptions = [
            { value: 'urgent', label: '🔴 Срочно' },
            { value: 'normal', label: '🟡 Обычно' },
            { value: 'later', label: '⚪ Не сейчас' }
        ];
        
        modal.innerHTML = `
            <div class="kanban-modal-backdrop"></div>
            <div class="kanban-modal-content">
                <div class="kanban-modal-header">
                    <input type="text" class="kanban-modal-title" value="${this.escapeHtml(card.title)}" placeholder="Название задачи...">
                    <button class="kanban-modal-close" title="Закрыть">×</button>
                </div>
                
                <div class="kanban-modal-body">
                    <div class="kanban-modal-section">
                        <label class="kanban-modal-label">Приоритет</label>
                        <div class="kanban-priority-selector">
                            ${priorityOptions.map(opt => `
                                <button class="kanban-priority-btn ${card.priority === opt.value ? 'active' : ''}" 
                                        data-priority="${opt.value}">
                                    ${opt.label}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="kanban-modal-section">
                        <label class="kanban-modal-label">Описание (Markdown)</label>
                        <div class="kanban-editor-toolbar">
                            <button class="kanban-format-btn" data-format="bold" title="Жирный (Ctrl+B)"><b>B</b></button>
                            <button class="kanban-format-btn" data-format="italic" title="Курсив (Ctrl+I)"><i>I</i></button>
                            <button class="kanban-format-btn" data-format="strike" title="Зачёркнутый"><s>S</s></button>
                            <button class="kanban-format-btn" data-format="code" title="Код">&lt;/&gt;</button>
                            <button class="kanban-format-btn" data-format="link" title="Ссылка">🔗</button>
                            <span class="kanban-toolbar-sep"></span>
                            <button class="kanban-format-btn" data-format="h1" title="Заголовок 1">H1</button>
                            <button class="kanban-format-btn" data-format="h2" title="Заголовок 2">H2</button>
                            <button class="kanban-format-btn" data-format="h3" title="Заголовок 3">H3</button>
                            <span class="kanban-toolbar-sep"></span>
                            <button class="kanban-format-btn" data-format="ul" title="Список">•</button>
                            <button class="kanban-format-btn" data-format="ol" title="Нумерованный список">1.</button>
                            <button class="kanban-format-btn" data-format="check" title="Чек-лист">☑</button>
                            <button class="kanban-format-btn" data-format="quote" title="Цитата">"</button>
                            <button class="kanban-format-btn" data-format="table" title="Таблица">⊞</button>
                        </div>
                        <div class="kanban-description-tabs">
                            <button class="kanban-desc-tab active" data-tab="edit">✏️ Редактировать</button>
                            <button class="kanban-desc-tab" data-tab="preview">👁️ Просмотр</button>
                        </div>
                        <textarea class="kanban-modal-description" id="kanban-description-textarea" placeholder="Подробное описание задачи...&#10;&#10;Используйте кнопки выше для форматирования или пишите Markdown напрямую.">${card.description || ''}</textarea>
                        <div class="kanban-modal-preview" style="display: none;"></div>
                    </div>
                    
                    <div class="kanban-modal-section">
                        <label class="kanban-modal-label">Изображения</label>
                        <div class="kanban-images-container">
                            <div class="kanban-images-grid" id="kanban-images-grid">
                                ${(card.images || []).map((img, idx) => `
                                    <div class="kanban-image-item" data-index="${idx}">
                                        <img src="${img}" alt="Image ${idx + 1}">
                                        <button class="kanban-image-remove" data-index="${idx}">×</button>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="kanban-image-upload">
                                <input type="file" id="kanban-image-input" accept="image/*" multiple style="display: none;">
                                <button class="kanban-upload-btn" id="kanban-upload-btn">
                                    📷 Добавить изображение
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="kanban-modal-footer">
                    <span class="kanban-modal-date">Создано: ${this.formatDate(card.created)}</span>
                    <div class="kanban-modal-actions">
                        <button class="kanban-modal-btn kanban-modal-delete">🗑️ Удалить</button>
                        <button class="kanban-modal-btn kanban-modal-save">💾 Сохранить</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Анимация появления
        requestAnimationFrame(() => {
            modal.classList.add('visible');
        });
        
        // Event listeners
        const closeModal = () => {
            modal.classList.remove('visible');
            setTimeout(() => modal.remove(), 300);
        };
        
        modal.querySelector('.kanban-modal-backdrop').addEventListener('click', closeModal);
        modal.querySelector('.kanban-modal-close').addEventListener('click', closeModal);
        
        // Priority selector
        modal.querySelectorAll('.kanban-priority-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.kanban-priority-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Markdown formatting buttons
        const textarea = modal.querySelector('.kanban-modal-description');
        modal.querySelectorAll('.kanban-format-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.insertFormat(textarea, btn.dataset.format);
            });
        });
        
        // Keyboard shortcuts for formatting
        textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'b') {
                    e.preventDefault();
                    this.insertFormat(textarea, 'bold');
                } else if (e.key === 'i') {
                    e.preventDefault();
                    this.insertFormat(textarea, 'italic');
                }
            }
        });
        
        // Description tabs
        const preview = modal.querySelector('.kanban-modal-preview');
        
        modal.querySelectorAll('.kanban-desc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                modal.querySelectorAll('.kanban-desc-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                if (tab.dataset.tab === 'preview') {
                    textarea.style.display = 'none';
                    preview.style.display = 'block';
                    preview.innerHTML = this.renderMarkdown(textarea.value);
                } else {
                    textarea.style.display = 'block';
                    preview.style.display = 'none';
                }
            });
        });
        
        // Image upload
        const imageInput = modal.querySelector('#kanban-image-input');
        const uploadBtn = modal.querySelector('#kanban-upload-btn');
        const imagesGrid = modal.querySelector('#kanban-images-grid');
        let currentImages = [...(card.images || [])];
        
        uploadBtn.addEventListener('click', () => imageInput.click());
        
        imageInput.addEventListener('change', (e) => {
            Array.from(e.target.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    currentImages.push(event.target.result);
                    this.updateImagesGrid(imagesGrid, currentImages);
                };
                reader.readAsDataURL(file);
            });
            imageInput.value = '';
        });
        
        // Remove image
        imagesGrid.addEventListener('click', (e) => {
            if (e.target.classList.contains('kanban-image-remove')) {
                const idx = parseInt(e.target.dataset.index);
                currentImages.splice(idx, 1);
                this.updateImagesGrid(imagesGrid, currentImages);
            }
        });
        
        // Save
        modal.querySelector('.kanban-modal-save').addEventListener('click', () => {
            const newTitle = modal.querySelector('.kanban-modal-title').value.trim();
            const newDescription = modal.querySelector('.kanban-modal-description').value;
            const newPriority = modal.querySelector('.kanban-priority-btn.active')?.dataset.priority || 'normal';
            
            if (!newTitle) {
                alert('Введите название задачи');
                return;
            }
            
            card.title = newTitle;
            card.description = newDescription;
            card.priority = newPriority;
            card.images = currentImages;
            card.modified = new Date().toISOString();
            
            // Обновляем только эту карточку в DOM
            const cardEl = this.container.querySelector(`[data-card-id="${card.id}"]`);
            if (cardEl) {
                const newCardEl = this.createCardElement(card);
                cardEl.replaceWith(newCardEl);
            }
            
            this.triggerChange();
            closeModal();
        });
        
        // Delete
        modal.querySelector('.kanban-modal-delete').addEventListener('click', () => {
            if (confirm('Удалить эту карточку?')) {
                this.cards = this.cards.filter(c => c.id !== card.id);
                
                // Удаляем из DOM
                const cardEl = this.container.querySelector(`[data-card-id="${card.id}"]`);
                if (cardEl) cardEl.remove();
                
                this.updateCounts();
                this.triggerChange();
                closeModal();
            }
        });
        
        // Escape to close
        const handleKeydown = (e) => {
            if (e.key === 'Escape' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
                closeModal();
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);
    }
    
    // Вставка форматирования в textarea
    insertFormat(textarea, format) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);
        
        let before = '';
        let after = '';
        let placeholder = '';
        
        switch (format) {
            case 'bold':
                before = '**';
                after = '**';
                placeholder = 'жирный текст';
                break;
            case 'italic':
                before = '*';
                after = '*';
                placeholder = 'курсив';
                break;
            case 'strike':
                before = '~~';
                after = '~~';
                placeholder = 'зачёркнутый';
                break;
            case 'code':
                before = '`';
                after = '`';
                placeholder = 'код';
                break;
            case 'link':
                before = '[';
                after = '](url)';
                placeholder = 'текст ссылки';
                break;
            case 'h1':
                before = '# ';
                after = '';
                placeholder = 'Заголовок';
                break;
            case 'h2':
                before = '## ';
                after = '';
                placeholder = 'Заголовок';
                break;
            case 'h3':
                before = '### ';
                after = '';
                placeholder = 'Заголовок';
                break;
            case 'ul':
                before = '- ';
                after = '';
                placeholder = 'элемент списка';
                break;
            case 'ol':
                before = '1. ';
                after = '';
                placeholder = 'элемент списка';
                break;
            case 'check':
                before = '- [ ] ';
                after = '';
                placeholder = 'задача';
                break;
            case 'quote':
                before = '> ';
                after = '';
                placeholder = 'цитата';
                break;
            case 'table':
                before = '\n| Заголовок 1 | Заголовок 2 |\n|-------------|-------------|\n| Ячейка 1    | Ячейка 2    |\n';
                after = '';
                placeholder = '';
                break;
        }
        
        const insertText = selectedText || placeholder;
        const newText = text.substring(0, start) + before + insertText + after + text.substring(end);
        
        textarea.value = newText;
        textarea.focus();
        
        // Выделяем вставленный текст
        const newStart = start + before.length;
        const newEnd = newStart + insertText.length;
        textarea.setSelectionRange(newStart, newEnd);
    }
    
    updateImagesGrid(grid, images) {
        grid.innerHTML = images.map((img, idx) => `
            <div class="kanban-image-item" data-index="${idx}">
                <img src="${img}" alt="Image ${idx + 1}">
                <button class="kanban-image-remove" data-index="${idx}">×</button>
            </div>
        `).join('');
    }
    
    // Utilities
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    renderMarkdown(text) {
        if (!text) return '<p style="color: var(--text-muted);">Нет описания</p>';
        
        let html = '';
        
        if (typeof marked !== 'undefined') {
            html = marked.parse(text);
        } else {
            // Fallback: простая обработка
            html = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/`(.+?)`/g, '<code>$1</code>')
                .replace(/\n/g, '<br>');
        }
        
        // Делаем внешние ссылки открывающимися в новой вкладке
        html = html.replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"');
        
        return html;
    }
    
    triggerChange() {
        if (this.onChange) {
            this.onChange();
        }
    }
    
    // Data serialization
    getData() {
        return JSON.stringify({
            columns: Object.keys(this.columns),
            cards: this.cards
        });
    }
    
    setData(jsonString) {
        try {
            const data = JSON.parse(jsonString || '{}');
            this.cards = data.cards || [];
            this.renderAllCards();
        } catch (e) {
            console.error('Error parsing kanban data:', e);
            this.cards = [];
            this.renderAllCards();
        }
    }
    
    clear() {
        this.cards = [];
        this.renderAllCards();
    }
}
