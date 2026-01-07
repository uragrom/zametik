// Поиск с подсветкой
class SearchHighlight {
    constructor(inputId, resultsId) {
        this.input = document.getElementById(inputId);
        this.resultsContainer = document.getElementById(resultsId);
        this.searchTimeout = null;
        this.onNoteClick = null;
        
        if (this.input && this.resultsContainer) {
            this.init();
        }
    }
    
    init() {
        this.input.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length === 0) {
                this.resultsContainer.innerHTML = '';
                this.resultsContainer.style.display = 'none';
                return;
            }
            
            // Debounce
            this.searchTimeout = setTimeout(() => {
                this.search(query);
            }, 300);
        });
        
        // Скрываем результаты при клике вне
        document.addEventListener('click', (e) => {
            if (!this.input.contains(e.target) && !this.resultsContainer.contains(e.target)) {
                this.resultsContainer.style.display = 'none';
            }
        });
    }
    
    async search(query) {
        try {
            const response = await fetch(`/api/search-full?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (response.ok && data.results) {
                this.displayResults(data.results, query);
            } else {
                this.resultsContainer.innerHTML = '<div class="search-no-results">Ошибка поиска</div>';
                this.resultsContainer.style.display = 'block';
            }
        } catch (error) {
            console.error('Ошибка поиска:', error);
            this.resultsContainer.innerHTML = '<div class="search-no-results">Ошибка подключения</div>';
            this.resultsContainer.style.display = 'block';
        }
    }
    
    displayResults(results, query) {
        if (results.length === 0) {
            this.resultsContainer.innerHTML = '<div class="search-no-results">Ничего не найдено</div>';
            this.resultsContainer.style.display = 'block';
            return;
        }
        
        const queryLower = query.toLowerCase();
        let html = '';
        
        results.forEach(result => {
            const titleHighlighted = this.highlightText(result.title, queryLower);
            let contentPreview = '';
            
            // Находим первое совпадение в содержимом для превью
            const contentMatch = result.matches.find(m => m.field === 'content');
            if (contentMatch && contentMatch.context) {
                const contextHighlighted = this.highlightText(contentMatch.context, queryLower);
                contentPreview = `<div class="search-result-preview">${contextHighlighted}</div>`;
            }
            
            html += `
                <div class="search-result-item" data-note-id="${result.id}">
                    <div class="search-result-title">${titleHighlighted}</div>
                    ${contentPreview}
                    ${result.tags && result.tags.length > 0 ? `
                        <div class="search-result-tags">
                            ${result.tags.map(tag => `<span class="search-result-tag">${this.escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        this.resultsContainer.innerHTML = html;
        this.resultsContainer.style.display = 'block';
        
        // Обработчики кликов
        this.resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const noteId = item.dataset.noteId;
                if (this.onNoteClick) {
                    this.onNoteClick(noteId);
                }
            });
        });
    }
    
    highlightText(text, query) {
        if (!query) return this.escapeHtml(text);
        
        // Экранируем HTML в тексте
        const escapedText = this.escapeHtml(text);
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return escapedText.replace(regex, '<mark>$1</mark>');
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    clear() {
        this.input.value = '';
        this.resultsContainer.innerHTML = '';
        this.resultsContainer.style.display = 'none';
    }
}

