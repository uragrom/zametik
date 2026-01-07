// Компактный календарь с popup и выбором цвета
class Calendar {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        this.currentDate = new Date();
        this.events = {};
        this.noteLinks = {}; // {date: [{id, title}]}
        this.onDayClick = null;
        this.selectedDate = null;
        this.colorPalette = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#e91e63'];
        
        this.init();
    }
    
    init() {
        this.createPopup();
        this.render();
        this.loadEvents();
        this.loadNoteLinks();
        this.checkHighlightDate();
    }
    
    // Проверка подсветки даты (при переходе с заметки)
    checkHighlightDate() {
        const highlightDate = localStorage.getItem('highlightCalendarDate');
        if (highlightDate) {
            localStorage.removeItem('highlightCalendarDate');
            // Перейти к месяцу и показать popup
            const date = new Date(highlightDate + 'T00:00:00');
            this.currentDate = date;
            this.render();
            setTimeout(() => {
                this.showPopup(highlightDate);
            }, 300);
        }
    }
    
    // Загрузка связей заметок с датами
    async loadNoteLinks() {
        try {
            const response = await fetch('/api/calendar/all-note-links');
            const data = await response.json();
            
            if (response.ok && data.links) {
                this.noteLinks = data.links;
                this.render();
            }
        } catch (error) {
            console.error('Ошибка загрузки связей заметок:', error);
        }
    }
    
    createPopup() {
        // Создаем popup для дня
        if (document.getElementById('calendar-popup')) return;
        
        const popup = document.createElement('div');
        popup.id = 'calendar-popup';
        popup.className = 'calendar-popup';
        popup.innerHTML = `
            <div class="calendar-popup-content">
                <div class="calendar-popup-header">
                    <span id="calendar-popup-date"></span>
                    <button class="calendar-popup-close">×</button>
                </div>
                <div class="calendar-popup-colors">
                    ${this.colorPalette.map(color => `
                        <button class="calendar-color-btn" data-color="${color}" style="background: ${color}"></button>
                    `).join('')}
                    <button class="calendar-color-btn calendar-color-clear" data-color="">✕</button>
                </div>
                <div class="calendar-popup-notes" id="calendar-popup-notes"></div>
                <div class="calendar-popup-events" id="calendar-popup-events"></div>
                <div class="calendar-popup-add">
                    <input type="text" id="calendar-event-input" placeholder="Добавить событие..." />
                    <button id="calendar-event-add-btn">+</button>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
        
        // Закрытие popup
        popup.querySelector('.calendar-popup-close').addEventListener('click', () => this.hidePopup());
        popup.addEventListener('click', (e) => {
            if (e.target === popup) this.hidePopup();
        });
        
        // Выбор цвета
        popup.querySelectorAll('.calendar-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.setDayColor(this.selectedDate, color);
            });
        });
        
        // Добавление события
        document.getElementById('calendar-event-add-btn').addEventListener('click', () => this.addEventFromInput());
        document.getElementById('calendar-event-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addEventFromInput();
        });
    }
    
    async addEventFromInput() {
        const input = document.getElementById('calendar-event-input');
        const text = input.value.trim();
        if (!text || !this.selectedDate) return;
        
        const event = {
            id: 'evt_' + Date.now(),
            title: text,
            type: 'event'
        };
        
        await this.addEvent(this.selectedDate, event);
        input.value = '';
        this.showPopup(this.selectedDate);
    }
    
    async loadEvents() {
        try {
            const response = await fetch('/api/calendar');
            const data = await response.json();
            
            if (response.ok && data.events) {
                this.events = data.events;
                this.render();
            }
        } catch (error) {
            console.error('Ошибка загрузки календаря:', error);
        }
    }
    
    render() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        
        const today = new Date();
        const todayStr = this.formatDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
        
        let html = `
            <div class="mini-calendar">
                <div class="mini-calendar-header">
                    <button class="mini-calendar-nav" id="cal-prev">‹</button>
                    <span class="mini-calendar-title">${monthNames[month]} ${year}</span>
                    <button class="mini-calendar-nav" id="cal-next">›</button>
                </div>
                <div class="mini-calendar-weekdays">
                    ${dayNames.map(d => `<span>${d[0]}</span>`).join('')}
                </div>
                <div class="mini-calendar-days">
        `;
        
        // Пустые ячейки
        for (let i = 0; i < startingDayOfWeek; i++) {
            html += '<span class="mini-day empty"></span>';
        }
        
        // Дни
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = this.formatDate(year, month + 1, day);
            const dayData = this.getDayData(dateStr);
            const isToday = dateStr === todayStr;
            const hasEvents = (this.events[dateStr] || []).filter(e => e.type === 'event').length > 0;
            const hasNotes = (this.noteLinks[dateStr] || []).length > 0;
            
            let style = '';
            if (dayData.color) {
                style = `background: ${dayData.color}; color: white;`;
            }
            
            let classes = ['mini-day'];
            if (isToday) classes.push('today');
            if (hasEvents) classes.push('has-event');
            if (hasNotes) classes.push('has-note');
            
            html += `
                <span class="${classes.join(' ')}" 
                      data-date="${dateStr}" style="${style}">${day}</span>
            `;
        }
        
        html += '</div></div>';
        this.container.innerHTML = html;
        
        // Обработчики навигации
        document.getElementById('cal-prev')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.render();
        });
        
        document.getElementById('cal-next')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.render();
        });
        
        // Клики по дням
        this.container.querySelectorAll('.mini-day:not(.empty)').forEach(dayEl => {
            dayEl.addEventListener('click', (e) => {
                const date = dayEl.dataset.date;
                this.showPopup(date, e);
            });
        });
    }
    
    showPopup(date, event) {
        this.selectedDate = date;
        const popup = document.getElementById('calendar-popup');
        if (!popup) return;
        
        // Заголовок
        const dateObj = new Date(date + 'T00:00:00');
        const options = { weekday: 'short', day: 'numeric', month: 'short' };
        document.getElementById('calendar-popup-date').textContent = dateObj.toLocaleDateString('ru-RU', options);
        
        // Привязанные заметки
        const notesContainer = document.getElementById('calendar-popup-notes');
        const linkedNotes = this.noteLinks[date] || [];
        
        if (linkedNotes.length > 0) {
            notesContainer.innerHTML = `
                <div class="calendar-popup-notes-title">📝 Заметки:</div>
                ${linkedNotes.map(note => `
                    <div class="calendar-popup-note" data-id="${note.id}">
                        <span class="note-icon">📄</span>
                        <span class="note-title">${note.title}</span>
                    </div>
                `).join('')}
            `;
            notesContainer.style.display = 'block';
            
            notesContainer.querySelectorAll('.calendar-popup-note').forEach(noteEl => {
                noteEl.addEventListener('click', () => {
                    const noteId = noteEl.dataset.id;
                    window.location.href = `/?note=${noteId}`;
                });
            });
        } else {
            notesContainer.innerHTML = '';
            notesContainer.style.display = 'none';
        }
        
        // События
        const eventsContainer = document.getElementById('calendar-popup-events');
        const events = (this.events[date] || []).filter(e => e.type === 'event');
        
        if (events.length === 0) {
            eventsContainer.innerHTML = '<div class="calendar-popup-empty">Нет событий</div>';
        } else {
            eventsContainer.innerHTML = events.map(evt => `
                <div class="calendar-popup-event">
                    <span>${evt.title}</span>
                    <button class="calendar-event-delete" data-id="${evt.id}">×</button>
                </div>
            `).join('');
            
            eventsContainer.querySelectorAll('.calendar-event-delete').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await this.removeEvent(date, btn.dataset.id);
                    this.showPopup(date);
                });
            });
        }
        
        popup.classList.add('visible');
    }
    
    hidePopup() {
        const popup = document.getElementById('calendar-popup');
        if (popup) popup.classList.remove('visible');
        this.selectedDate = null;
    }
    
    getDayData(date) {
        const events = this.events[date] || [];
        const colorMarker = events.find(e => e.type === 'color_marker');
        return {
            color: colorMarker ? colorMarker.color : null,
            events: events.filter(e => e.type === 'event')
        };
    }
    
    async setDayColor(date, color) {
        if (!date) return;
        
        // Удаляем старый маркер цвета (если есть)
        const events = this.events[date] || [];
        const oldMarker = events.find(e => e.type === 'color_marker');
        
        if (oldMarker) {
            await this.removeEvent(date, oldMarker.id);
        }
        
        // Добавляем новый маркер цвета (если цвет указан)
        if (color) {
            const marker = {
                id: 'color_' + Date.now(),
                type: 'color_marker',
                color: color
            };
            
            try {
                const response = await fetch('/api/calendar/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date, event: marker })
                });
                
                if (response.ok) {
                    await this.loadEvents();
                }
            } catch (error) {
                console.error('Ошибка добавления цвета:', error);
            }
        }
        
        this.hidePopup();
    }
    
    formatDate(year, month, day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    isDayImportant(date) {
        if (!this.events[date]) return false;
        return this.events[date].some(event => event.type === 'important_marker');
    }
    
    async markDayImportant(date, important) {
        try {
            const response = await fetch('/api/calendar/mark-important', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, important })
            });
            
            if (response.ok) {
                await this.loadEvents();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка отметки дня:', error);
            return false;
        }
    }
    
    async addEvent(date, event) {
        try {
            const response = await fetch('/api/calendar/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, event })
            });
            
            if (response.ok) {
                await this.loadEvents();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка добавления события:', error);
            return false;
        }
    }
    
    async removeEvent(date, eventId) {
        try {
            const response = await fetch('/api/calendar/events/' + eventId, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date })
            });
            
            if (response.ok) {
                await this.loadEvents();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка удаления события:', error);
            return false;
        }
    }
    
    getDayEvents(date) {
        return this.events[date] || [];
    }
}
