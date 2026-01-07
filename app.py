from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_session import Session
import os
from auth import AuthManager
from encryption import EncryptionManager
from file_manager import FileManager

app = Flask(__name__)

# Генерируем постоянный SECRET_KEY или используем существующий
SECRET_KEY_FILE = 'secret_key.txt'
if os.path.exists(SECRET_KEY_FILE):
    with open(SECRET_KEY_FILE, 'rb') as f:
        app.config['SECRET_KEY'] = f.read()
else:
    secret_key = os.urandom(24)
    with open(SECRET_KEY_FILE, 'wb') as f:
        f.write(secret_key)
    app.config['SECRET_KEY'] = secret_key

app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = True
app.config['SESSION_COOKIE_SECURE'] = False
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
Session(app)

# Инициализация менеджеров
auth_manager = AuthManager()


def get_encryption_manager():
    if 'password' in session:
        return EncryptionManager(session['password'])
    return None


def require_auth(f):
    def wrapper(*args, **kwargs):
        if 'authenticated' not in session or not session['authenticated']:
            return jsonify({"error": "Требуется аутентификация"}), 401
        
        password = session.get('password', '')
        if not password:
            session.clear()
            return jsonify({"error": "Сессия истекла"}), 401
        
        # Проверяем, что пароль - строка
        if not isinstance(password, str):
            session.clear()
            return jsonify({"error": "Неверный формат пароля в сессии"}), 401
        
        # НЕ обрезаем пароль - он может содержать пробелы в начале/конце
        # Просто проверяем, что он не пустой
        if len(password) == 0:
            session.clear()
            return jsonify({"error": "Пароль в сессии пуст"}), 401
        
        try:
            enc_mgr = EncryptionManager(password)
            file_mgr = FileManager(encryption_manager=enc_mgr)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Ошибка инициализации: {str(e)}"}), 500
        
        kwargs['encryption_manager'] = enc_mgr
        kwargs['file_manager'] = file_mgr
        
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/home')
@require_auth
def home(**kwargs):
    return render_template('home.html')


@app.route('/api/init', methods=['POST'])
def init_password():
    data = request.get_json()
    password = data.get('password', '')
    
    if not password:
        return jsonify({"error": "Пароль не может быть пустым"}), 400
    
    # Убеждаемся, что пароль - строка (НЕ обрезаем - пароль может содержать пробелы)
    password = str(password)
    
    if auth_manager.is_initialized():
        return jsonify({"error": "Система уже инициализирована"}), 400
    
    if auth_manager.set_password(password):
        # Очищаем сессию перед установкой нового пароля
        session.clear()
        session['authenticated'] = True
        session['password'] = password  # Сохраняем БЕЗ обрезки
        session.permanent = True
        session.modified = True
        
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Ошибка инициализации"}), 500


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    password = data.get('password', '')
    
    if not password:
        return jsonify({"error": "Пароль не может быть пустым"}), 400
    
    if auth_manager.check_password(password):
        # Очищаем сессию перед установкой нового пароля
        session.clear()
        session['authenticated'] = True
        session['password'] = password  # Сохраняем как строку БЕЗ обрезки
        session.permanent = True
        session.modified = True
        
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Неверный пароль"}), 401


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True})


@app.route('/api/change-password', methods=['POST'])
@require_auth
def change_password(**kwargs):
    data = request.get_json()
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')
    
    if not old_password or not new_password:
        return jsonify({"error": "Заполните все поля"}), 400
    
    if len(new_password) < 6:
        return jsonify({"error": "Новый пароль должен быть не менее 6 символов"}), 400
    
    if auth_manager.reset_password(old_password, new_password):
        # Обновляем пароль в сессии
        session['password'] = new_password
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Неверный текущий пароль"}), 401


@app.route('/api/check-auth', methods=['GET'])
def check_auth():
    is_init = auth_manager.is_initialized()
    is_auth = session.get('authenticated', False)
    
    return jsonify({
        "initialized": is_init,
        "authenticated": is_auth
    })


@app.route('/api/notes', methods=['GET'])
@require_auth
def get_notes(file_manager=None, **kwargs):
    try:
        notes = file_manager.list_notes()
        return jsonify({"notes": notes})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/notes/<note_id>', methods=['GET'])
@require_auth
def get_note(note_id, file_manager=None, **kwargs):
    try:
        note = file_manager.get_note(note_id)
        if note:
            # Логируем открытие заметки
            file_manager.log_access(note_id, 'open')
            return jsonify({"note": note})
        else:
            return jsonify({"error": "Заметка не найдена"}), 404
    except ValueError as e:
        # Ошибка расшифровки - возможно неверный пароль
        error_msg = str(e)
        if error_msg.startswith("Ошибка расшифровки:"):
            error_msg = error_msg.replace("Ошибка расшифровки: ", "", 1)
        
        # Если это ошибка пароля, возвращаем специальный код
        if "неверный пароль" in error_msg.lower() or "invalidtag" in error_msg.lower() or "decryption failed" in error_msg.lower():
            return jsonify({
                "error": "Неверный пароль для этой заметки",
                "needs_old_password": True,
                "message": "Эта заметка была создана с другим паролем. Введите старый пароль для восстановления доступа."
            }), 403
        
        return jsonify({"error": f"Ошибка расшифровки: {error_msg}"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Ошибка загрузки заметки: {str(e)}"}), 500


@app.route('/api/notes/<note_id>/recover', methods=['POST'])
@require_auth
def recover_note(note_id, file_manager=None, encryption_manager=None, **kwargs):
    """Восстановление доступа к заметке со старым паролем"""
    try:
        data = request.get_json()
        old_password = data.get('old_password', '')
        
        if not old_password:
            return jsonify({"error": "Введите старый пароль"}), 400
        
        old_password = str(old_password)
        current_password = session.get('password', '')
        
        # Создаем менеджер шифрования со старым паролем
        from encryption import EncryptionManager
        old_enc_mgr = EncryptionManager(old_password)
        old_file_mgr = FileManager(encryption_manager=old_enc_mgr)
        
        # Пытаемся прочитать заметку со старым паролем
        try:
            note = old_file_mgr.get_note(note_id)
            if not note:
                return jsonify({"error": "Заметка не найдена"}), 404
        except ValueError:
            return jsonify({"error": "Неверный старый пароль"}), 401
        
        # Если успешно прочитали, перешифровываем с новым паролем
        # Используем текущий менеджер шифрования (с новым паролем)
        encrypted_content = encryption_manager.encrypt(note['content'])
        
        # Сохраняем перешифрованную заметку
        from pathlib import Path
        notes_dir = Path("notes")
        file_path = notes_dir / f"{note_id}.enc"
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(encrypted_content)
        
        # Возвращаем заметку
        return jsonify({
            "note": note,
            "message": "Заметка успешно восстановлена и перешифрована с новым паролем"
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Ошибка восстановления: {str(e)}"}), 500


@app.route('/api/notes', methods=['POST'])
@require_auth
def create_note(file_manager=None, **kwargs):
    try:
        data = request.get_json()
        title = data.get('title', 'Untitled')
        content = data.get('content', '')
        tags = data.get('tags', [])
        note_type = data.get('type', 'text')
        
        note = file_manager.create_note(title, content, tags=tags, note_type=note_type)
        return jsonify({"note": note}), 201
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/notes/<note_id>', methods=['PUT'])
@require_auth
def update_note(note_id, file_manager=None, **kwargs):
    try:
        data = request.get_json()
        title = data.get('title')
        content = data.get('content')
        tags = data.get('tags')
        
        if file_manager.update_note(note_id, title=title, content=content, tags=tags):
            note = file_manager.get_note(note_id)
            return jsonify({"note": note})
        else:
            return jsonify({"error": "Заметка не найдена"}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/notes/<note_id>', methods=['DELETE'])
@require_auth
def delete_note(note_id, file_manager=None, **kwargs):
    try:
        if file_manager.delete_note(note_id):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Заметка не найдена"}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/search', methods=['GET'])
@require_auth
def search_notes(file_manager=None, **kwargs):
    try:
        query = request.args.get('q', '')
        if not query:
            return jsonify({"notes": []})
        
        results = file_manager.search_notes(query)
        return jsonify({"notes": results})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/search-full', methods=['GET'])
@require_auth
def search_notes_full(file_manager=None, **kwargs):
    """Расширенный поиск с позициями совпадений для подсветки"""
    try:
        query = request.args.get('q', '')
        if not query:
            return jsonify({"results": []})
        
        query_lower = query.lower()
        results = []
        
        # Получаем все заметки
        all_notes = file_manager.list_notes()
        
        for note_meta in all_notes:
            note = file_manager.get_note(note_meta["id"])
            if not note:
                continue
            
            matches = []
            
            # Ищем в заголовке
            title_lower = note["title"].lower()
            if query_lower in title_lower:
                start = title_lower.find(query_lower)
                matches.append({
                    "field": "title",
                    "start": start,
                    "end": start + len(query_lower),
                    "text": note["title"]
                })
            
            # Ищем в содержимом
            content_lower = note["content"].lower()
            if query_lower in content_lower:
                start = 0
                while True:
                    pos = content_lower.find(query_lower, start)
                    if pos == -1:
                        break
                    # Получаем контекст (50 символов до и после)
                    context_start = max(0, pos - 50)
                    context_end = min(len(note["content"]), pos + len(query_lower) + 50)
                    context = note["content"][context_start:context_end]
                    matches.append({
                        "field": "content",
                        "start": pos,
                        "end": pos + len(query_lower),
                        "context": context,
                        "context_start": context_start
                    })
                    start = pos + 1
            
            if matches:
                results.append({
                    "id": note["id"],
                    "title": note["title"],
                    "tags": note.get("tags", []),
                    "matches": matches
                })
        
        return jsonify({"results": results})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/home', methods=['GET'])
@require_auth
def get_home_data(file_manager=None, **kwargs):
    """Получает данные для главной страницы (граф заметок)"""
    try:
        graph_data = file_manager.get_graph_data()
        return jsonify(graph_data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/notes/<note_id>/links', methods=['GET'])
@require_auth
def get_note_links(note_id, file_manager=None, **kwargs):
    """Получает связи заметки"""
    try:
        links = file_manager.get_note_links(note_id)
        return jsonify({"links": links})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/notes/<note_id>/links', methods=['PUT'])
@require_auth
def update_note_links(note_id, file_manager=None, **kwargs):
    """Обновляет связи заметки"""
    try:
        data = request.get_json()
        links = data.get('links', [])
        
        if not isinstance(links, list):
            return jsonify({"error": "links должен быть массивом"}), 400
        
        if file_manager.update_note_links(note_id, links):
            return jsonify({"success": True, "links": links})
        else:
            return jsonify({"error": "Заметка не найдена"}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/dictionary', methods=['GET'])
@require_auth
def get_dictionary(file_manager=None, **kwargs):
    try:
        phrases = file_manager.list_phrases()
        return jsonify({"phrases": phrases})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/dictionary/<phrase>', methods=['GET'])
@require_auth
def get_phrase(phrase, file_manager=None, **kwargs):
    try:
        from urllib.parse import unquote
        phrase_decoded = unquote(phrase)
        value = file_manager.get_phrase(phrase_decoded)
        if value:
            return jsonify({"phrase": phrase_decoded, "value": value})
        else:
            return jsonify({"error": "Фраза не найдена"}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/dictionary', methods=['POST'])
@require_auth
def add_phrase(file_manager=None, **kwargs):
    try:
        data = request.get_json()
        phrase = data.get('phrase', '').strip()
        value = data.get('value', '').strip()
        
        if not phrase:
            return jsonify({"error": "Фраза не может быть пустой"}), 400
        
        if file_manager.add_phrase(phrase, value):
            return jsonify({"success": True, "phrase": phrase, "value": value})
        else:
            return jsonify({"error": "Ошибка сохранения"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/dictionary/<phrase>', methods=['DELETE'])
@require_auth
def delete_phrase(phrase, file_manager=None, **kwargs):
    try:
        from urllib.parse import unquote
        phrase_decoded = unquote(phrase)
        if file_manager.delete_phrase(phrase_decoded):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Фраза не найдена"}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========== API ДЛЯ РАБОТЫ С TODO ==========

@app.route('/api/todos/global', methods=['GET'])
@require_auth
def get_global_todos(file_manager=None, **kwargs):
    try:
        todos = file_manager.get_global_todos()
        return jsonify({"todos": todos})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/todos/global', methods=['POST'])
@require_auth
def save_global_todos(file_manager=None, **kwargs):
    try:
        data = request.get_json()
        todos = data.get('todos', [])
        
        if file_manager.save_global_todos(todos):
            return jsonify({"success": True, "todos": todos})
        else:
            return jsonify({"error": "Ошибка сохранения"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/todos/global/<todo_id>', methods=['PUT'])
@require_auth
def update_global_todo(todo_id, file_manager=None, **kwargs):
    try:
        data = request.get_json()
        todos = file_manager.get_global_todos()
        
        # Находим задачу и обновляем
        updated = False
        for todo in todos:
            if todo.get('id') == todo_id:
                todo.update(data)
                todo['modified'] = file_manager._get_timestamp()
                updated = True
                break
        
        if not updated:
            return jsonify({"error": "Задача не найдена"}), 404
        
        if file_manager.save_global_todos(todos):
            return jsonify({"success": True, "todo": next(t for t in todos if t.get('id') == todo_id)})
        else:
            return jsonify({"error": "Ошибка сохранения"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/todos/global/<todo_id>', methods=['DELETE'])
@require_auth
def delete_global_todo(todo_id, file_manager=None, **kwargs):
    try:
        todos = file_manager.get_global_todos()
        original_count = len(todos)
        todos = [t for t in todos if t.get('id') != todo_id]
        
        if len(todos) == original_count:
            return jsonify({"error": "Задача не найдена"}), 404
        
        if file_manager.save_global_todos(todos):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Ошибка сохранения"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/todos/note/<note_id>', methods=['GET'])
@require_auth
def get_note_todos(note_id, file_manager=None, **kwargs):
    try:
        todos = file_manager.get_note_todos(note_id)
        return jsonify({"todos": todos})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/todos/note/<note_id>', methods=['POST'])
@require_auth
def save_note_todos(note_id, file_manager=None, **kwargs):
    try:
        data = request.get_json()
        todos = data.get('todos', [])
        
        if file_manager.save_note_todos(note_id, todos):
            return jsonify({"success": True, "todos": todos})
        else:
            return jsonify({"error": "Заметка не найдена"}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/todos/note/<note_id>/<todo_id>', methods=['PUT'])
@require_auth
def update_note_todo(note_id, todo_id, file_manager=None, **kwargs):
    try:
        data = request.get_json()
        todos = file_manager.get_note_todos(note_id)
        
        # Находим задачу и обновляем
        updated = False
        for todo in todos:
            if todo.get('id') == todo_id:
                todo.update(data)
                todo['modified'] = file_manager._get_timestamp()
                updated = True
                break
        
        if not updated:
            return jsonify({"error": "Задача не найдена"}), 404
        
        if file_manager.save_note_todos(note_id, todos):
            return jsonify({"success": True, "todo": next(t for t in todos if t.get('id') == todo_id)})
        else:
            return jsonify({"error": "Ошибка сохранения"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/todos/note/<note_id>/<todo_id>', methods=['DELETE'])
@require_auth
def delete_note_todo(note_id, todo_id, file_manager=None, **kwargs):
    try:
        todos = file_manager.get_note_todos(note_id)
        original_count = len(todos)
        todos = [t for t in todos if t.get('id') != todo_id]
        
        if len(todos) == original_count:
            return jsonify({"error": "Задача не найдена"}), 404
        
        if file_manager.save_note_todos(note_id, todos):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Ошибка сохранения"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========== API ДЛЯ КАЛЕНДАРЯ ==========

@app.route('/api/calendar', methods=['GET'])
@require_auth
def get_calendar(file_manager=None, **kwargs):
    """Получает события календаря"""
    try:
        events = file_manager.get_calendar_events()
        return jsonify({"events": events})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/calendar/events', methods=['POST'])
@require_auth
def add_calendar_event(file_manager=None, **kwargs):
    """Добавляет событие в календарь"""
    try:
        data = request.get_json()
        date = data.get('date')
        event = data.get('event')
        
        if not date or not event:
            return jsonify({"error": "Требуются date и event"}), 400
        
        import uuid
        if 'id' not in event:
            event['id'] = str(uuid.uuid4())
        
        if file_manager.add_calendar_event(date, event):
            return jsonify({"success": True, "event": event}), 201
        else:
            return jsonify({"error": "Ошибка сохранения"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/calendar/events/<event_id>', methods=['PUT'])
@require_auth
def update_calendar_event(event_id, file_manager=None, **kwargs):
    """Обновляет событие в календаре"""
    try:
        data = request.get_json()
        date = data.get('date')
        event = data.get('event')
        
        if not date or not event:
            return jsonify({"error": "Требуются date и event"}), 400
        
        if file_manager.update_calendar_event(date, event_id, event):
            return jsonify({"success": True, "event": event})
        else:
            return jsonify({"error": "Событие не найдено"}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/calendar/events/<event_id>', methods=['DELETE'])
@require_auth
def delete_calendar_event(event_id, file_manager=None, **kwargs):
    """Удаляет событие из календаря"""
    try:
        data = request.get_json()
        date = data.get('date')
        
        if not date:
            return jsonify({"error": "Требуется date"}), 400
        
        if file_manager.remove_calendar_event(date, event_id):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Событие не найдено"}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/calendar/mark-important', methods=['POST'])
@require_auth
def mark_day_important(file_manager=None, **kwargs):
    """Отмечает день как важный"""
    try:
        data = request.get_json()
        date = data.get('date')
        important = data.get('important', True)
        
        if not date:
            return jsonify({"error": "Требуется date"}), 400
        
        if file_manager.mark_day_important(date, important):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Ошибка сохранения"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========== API ДЛЯ ИСТОРИИ ЗАХОДОВ ==========

@app.route('/api/access-history', methods=['GET'])
@require_auth
def get_access_history(file_manager=None, **kwargs):
    """Получает историю заходов"""
    try:
        limit = request.args.get('limit', 20, type=int)
        history = file_manager.get_access_history(limit)
        
        # Обогащаем историю названиями заметок
        enriched_history = []
        for entry in history:
            note_id = entry.get('note_id')
            note_meta = None
            if note_id:
                all_notes = file_manager.list_notes()
                note_meta = next((n for n in all_notes if n['id'] == note_id), None)
            
            enriched_entry = {
                'date': entry.get('date'),
                'action': entry.get('action'),
                'note_id': note_id,
                'note_title': note_meta['title'] if note_meta else 'Удаленная заметка'
            }
            enriched_history.append(enriched_entry)
        
        return jsonify({"history": enriched_history})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========== API ДЛЯ СВЯЗИ ЗАМЕТОК И КАЛЕНДАРЯ ==========

@app.route('/api/notes/<note_id>/link-date', methods=['POST'])
@require_auth
def link_note_to_date(note_id, file_manager=None, **kwargs):
    """Привязывает заметку к дате календаря"""
    try:
        data = request.get_json()
        date = data.get('date')
        
        if not date:
            return jsonify({"error": "Требуется date"}), 400
        
        if file_manager.link_note_to_date(note_id, date):
            return jsonify({"success": True, "date": date})
        else:
            return jsonify({"error": "Ошибка привязки"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/notes/<note_id>/unlink-date', methods=['POST'])
@require_auth
def unlink_note_from_date(note_id, file_manager=None, **kwargs):
    """Отвязывает заметку от даты календаря"""
    try:
        if file_manager.unlink_note_from_date(note_id):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Ошибка отвязки"}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/notes/<note_id>/linked-date', methods=['GET'])
@require_auth
def get_note_linked_date(note_id, file_manager=None, **kwargs):
    """Получает дату привязанную к заметке"""
    try:
        date = file_manager.get_note_linked_date(note_id)
        return jsonify({"date": date})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/calendar/notes/<date>', methods=['GET'])
@require_auth
def get_notes_for_date(date, file_manager=None, **kwargs):
    """Получает заметки привязанные к дате"""
    try:
        notes = file_manager.get_notes_for_date(date)
        return jsonify({"notes": notes})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/calendar/all-note-links', methods=['GET'])
@require_auth
def get_all_date_note_links(file_manager=None, **kwargs):
    """Получает все связи дат и заметок"""
    try:
        links = file_manager.get_all_date_note_links()
        return jsonify({"links": links})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

