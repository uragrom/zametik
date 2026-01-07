"""
Менеджер файлов для работы с зашифрованными заметками
"""
import os
import json
import re
from pathlib import Path
from typing import List, Dict, Optional
from encryption import EncryptionManager


class FileManager:
    """Менеджер для работы с зашифрованными файлами заметок"""
    
    def __init__(self, notes_dir: str = "notes", encryption_manager: Optional[EncryptionManager] = None):
        """
        Инициализация менеджера файлов
        
        Args:
            notes_dir: Директория для хранения заметок
            encryption_manager: Менеджер шифрования
        """
        self.notes_dir = Path(notes_dir)
        self.notes_dir.mkdir(exist_ok=True)
        self.encryption_manager = encryption_manager
        self.metadata_file = self.notes_dir / "metadata.json"
        self._ensure_metadata_exists()
    
    def _ensure_metadata_exists(self):
        """Создает файл метаданных, если его нет"""
        if not self.metadata_file.exists():
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump({"notes": {}}, f)
    
    def _load_metadata(self) -> Dict:
        """Загружает метаданные"""
        try:
            with open(self.metadata_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {"notes": {}}
    
    def _save_metadata(self, metadata: Dict):
        """Сохраняет метаданные"""
        with open(self.metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
    
    def _sanitize_filename(self, filename: str) -> str:
        """
        Очищает имя файла от недопустимых символов
        
        Args:
            filename: Исходное имя файла
            
        Returns:
            Очищенное имя файла
        """
        # Удаляем недопустимые символы
        filename = re.sub(r'[<>:"/\\|?*]', '', filename)
        # Заменяем пробелы на подчеркивания
        filename = filename.replace(' ', '_')
        # Ограничиваем длину
        if len(filename) > 100:
            filename = filename[:100]
        return filename or "untitled"
    
    def _get_file_path(self, note_id: str) -> Path:
        """Получает путь к файлу заметки"""
        return self.notes_dir / f"{note_id}.enc"
    
    def create_note(self, title: str, content: str = "", tags: List[str] = None, note_type: str = "text") -> Dict:
        """
        Создает новую заметку
        
        Args:
            title: Заголовок заметки
            content: Содержимое заметки
            tags: Список тегов
            note_type: Тип заметки ("text" или "canvas")
            
        Returns:
            Словарь с информацией о заметке
        """
        if not self.encryption_manager:
            raise ValueError("EncryptionManager не установлен")
        
        # Генерируем ID
        import uuid
        note_id = str(uuid.uuid4())
        
        # Шифруем содержимое
        encrypted_content = self.encryption_manager.encrypt(content)
        
        # Сохраняем файл
        file_path = self._get_file_path(note_id)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(encrypted_content)
        
        # Обновляем метаданные
        metadata = self._load_metadata()
        metadata["notes"][note_id] = {
            "id": note_id,
            "title": title,
            "tags": tags or [],
            "type": note_type,
            "created": self._get_timestamp(),
            "modified": self._get_timestamp()
        }
        self._save_metadata(metadata)
        
        return metadata["notes"][note_id]
    
    def get_note(self, note_id: str) -> Optional[Dict]:
        """
        Получает заметку по ID
        
        Args:
            note_id: ID заметки
            
        Returns:
            Словарь с заметкой или None
        """
        if not self.encryption_manager:
            raise ValueError("EncryptionManager не установлен")
        
        file_path = self._get_file_path(note_id)
        if not file_path.exists():
            return None
        
        try:
            # Читаем зашифрованный файл
            with open(file_path, 'r', encoding='utf-8') as f:
                encrypted_content = f.read().strip()
            
            # Проверяем, что файл не пустой
            if not encrypted_content:
                raise ValueError("Файл заметки пуст")
            
            # Расшифровываем
            try:
                content = self.encryption_manager.decrypt(encrypted_content)
            except ValueError as e:
                # Добавляем информацию о файле для диагностики
                error_msg = str(e)
                raise ValueError(f"{error_msg} (файл: {note_id}.enc)")
            
            # Получаем метаданные
            metadata = self._load_metadata()
            note_meta = metadata["notes"].get(note_id, {})
            
            return {
                "id": note_id,
                "title": note_meta.get("title", "Untitled"),
                "content": content,
                "tags": note_meta.get("tags", []),
                "type": note_meta.get("type", "text"),
                "created": note_meta.get("created", ""),
                "modified": note_meta.get("modified", "")
            }
        except ValueError as e:
            # Ошибка расшифровки (неверный пароль или поврежденные данные)
            # Не оборачиваем ValueError, передаем как есть
            raise
        except Exception as e:
            print(f"Ошибка чтения заметки {note_id}: {e}")
            import traceback
            traceback.print_exc()
            raise Exception(f"Ошибка чтения заметки: {type(e).__name__}: {str(e)}")
    
    def update_note(self, note_id: str, title: Optional[str] = None, content: Optional[str] = None, tags: Optional[List[str]] = None) -> bool:
        """
        Обновляет заметку
        
        Args:
            note_id: ID заметки
            title: Новый заголовок (опционально)
            content: Новое содержимое (опционально)
            
        Returns:
            True если успешно
        """
        if not self.encryption_manager:
            raise ValueError("EncryptionManager не установлен")
        
        file_path = self._get_file_path(note_id)
        if not file_path.exists():
            return False
        
        try:
            # Если обновляется содержимое, перешифровываем
            if content is not None:
                encrypted_content = self.encryption_manager.encrypt(content)
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(encrypted_content)
            
            # Обновляем метаданные
            metadata = self._load_metadata()
            if note_id in metadata["notes"]:
                if title is not None:
                    metadata["notes"][note_id]["title"] = title
                if tags is not None:
                    metadata["notes"][note_id]["tags"] = tags
                metadata["notes"][note_id]["modified"] = self._get_timestamp()
                self._save_metadata(metadata)
            
            return True
        except Exception as e:
            print(f"Ошибка обновления заметки {note_id}: {e}")
            return False
    
    def delete_note(self, note_id: str) -> bool:
        """
        Удаляет заметку
        
        Args:
            note_id: ID заметки
            
        Returns:
            True если успешно
        """
        try:
            file_path = self._get_file_path(note_id)
            if file_path.exists():
                file_path.unlink()
            
            # Удаляем из метаданных
            metadata = self._load_metadata()
            if note_id in metadata["notes"]:
                del metadata["notes"][note_id]
                self._save_metadata(metadata)
            
            return True
        except Exception as e:
            print(f"Ошибка удаления заметки {note_id}: {e}")
            return False
    
    def list_notes(self) -> List[Dict]:
        """
        Получает список всех заметок
        
        Returns:
            Список словарей с метаданными заметок
        """
        metadata = self._load_metadata()
        notes = []
        for note_id, note_data in metadata["notes"].items():
            notes.append({
                "id": note_id,
                "title": note_data.get("title", "Untitled"),
                "tags": note_data.get("tags", []),
                "type": note_data.get("type", "text"),
                "created": note_data.get("created", ""),
                "modified": note_data.get("modified", "")
            })
        # Сортируем по дате изменения (новые первыми)
        notes.sort(key=lambda x: x.get("modified", ""), reverse=True)
        return notes
    
    def search_notes(self, query: str) -> List[Dict]:
        """
        Ищет заметки по содержимому
        
        Args:
            query: Поисковый запрос
            
        Returns:
            Список найденных заметок
        """
        if not self.encryption_manager:
            return []
        
        query_lower = query.lower()
        results = []
        
        # Получаем все заметки
        all_notes = self.list_notes()
        
        for note_meta in all_notes:
            note = self.get_note(note_meta["id"])
            if note:
                # Ищем в заголовке
                if query_lower in note["title"].lower():
                    results.append(note_meta)
                    continue
                
                # Ищем в содержимом
                if query_lower in note["content"].lower():
                    results.append(note_meta)
        
        return results
    
    def _get_timestamp(self) -> str:
        """Получает текущую временную метку"""
        from datetime import datetime
        return datetime.now().isoformat()
    
    def get_dictionary_file(self) -> Path:
        """Получает путь к файлу словаря"""
        return self.notes_dir / "dictionary.enc"
    
    def get_dictionary(self) -> Dict[str, str]:
        """
        Получает словарь фраз
        
        Returns:
            Словарь {фраза: значение}
        """
        if not self.encryption_manager:
            raise ValueError("EncryptionManager не установлен")
        
        dict_file = self.get_dictionary_file()
        if not dict_file.exists():
            return {}
        
        try:
            with open(dict_file, 'r', encoding='utf-8') as f:
                encrypted_content = f.read()
            
            decrypted_content = self.encryption_manager.decrypt(encrypted_content)
            return json.loads(decrypted_content)
        except Exception as e:
            print(f"Ошибка чтения словаря: {e}")
            return {}
    
    def save_dictionary(self, dictionary: Dict[str, str]) -> bool:
        """
        Сохраняет словарь фраз
        
        Args:
            dictionary: Словарь {фраза: значение}
            
        Returns:
            True если успешно
        """
        if not self.encryption_manager:
            raise ValueError("EncryptionManager не установлен")
        
        try:
            dict_json = json.dumps(dictionary, ensure_ascii=False, indent=2)
            encrypted_content = self.encryption_manager.encrypt(dict_json)
            
            dict_file = self.get_dictionary_file()
            with open(dict_file, 'w', encoding='utf-8') as f:
                f.write(encrypted_content)
            
            return True
        except Exception as e:
            print(f"Ошибка сохранения словаря: {e}")
            return False
    
    def add_phrase(self, phrase: str, value: str) -> bool:
        """
        Добавляет или обновляет фразу в словаре
        
        Args:
            phrase: Фраза
            value: Значение
            
        Returns:
            True если успешно
        """
        dictionary = self.get_dictionary()
        dictionary[phrase] = value
        return self.save_dictionary(dictionary)
    
    def get_phrase(self, phrase: str) -> Optional[str]:
        """
        Получает значение фразы из словаря
        
        Args:
            phrase: Фраза
            
        Returns:
            Значение или None
        """
        dictionary = self.get_dictionary()
        return dictionary.get(phrase)
    
    def delete_phrase(self, phrase: str) -> bool:
        """
        Удаляет фразу из словаря
        
        Args:
            phrase: Фраза
            
        Returns:
            True если успешно
        """
        dictionary = self.get_dictionary()
        if phrase in dictionary:
            del dictionary[phrase]
            return self.save_dictionary(dictionary)
        return False
    
    def list_phrases(self) -> List[Dict[str, str]]:
        """
        Получает список всех фраз
        
        Returns:
            Список словарей {phrase, value}
        """
        dictionary = self.get_dictionary()
        return [{"phrase": k, "value": v} for k, v in dictionary.items()]
    
    # ========== МЕТОДЫ ДЛЯ РАБОТЫ С TODO ==========
    
    def get_note_todos(self, note_id: str) -> List[Dict]:
        """
        Получает TODO для заметки из метаданных
        
        Args:
            note_id: ID заметки
            
        Returns:
            Список задач TODO
        """
        metadata = self._load_metadata()
        if note_id in metadata["notes"]:
            return metadata["notes"][note_id].get("todos", [])
        return []
    
    def save_note_todos(self, note_id: str, todos: List[Dict]) -> bool:
        """
        Сохраняет TODO в метаданные заметки
        
        Args:
            note_id: ID заметки
            todos: Список задач TODO
            
        Returns:
            True если успешно
        """
        try:
            metadata = self._load_metadata()
            if note_id in metadata["notes"]:
                metadata["notes"][note_id]["todos"] = todos
                metadata["notes"][note_id]["modified"] = self._get_timestamp()
                self._save_metadata(metadata)
                return True
            return False
        except Exception as e:
            print(f"Ошибка сохранения TODO для заметки {note_id}: {e}")
            return False
    
    def get_global_todos_file(self) -> Path:
        """Получает путь к файлу глобального TODO"""
        return self.notes_dir / "global_todos.enc"
    
    def get_global_todos(self) -> List[Dict]:
        """
        Получает глобальный TODO из зашифрованного файла
        
        Returns:
            Список задач TODO
        """
        if not self.encryption_manager:
            raise ValueError("EncryptionManager не установлен")
        
        todos_file = self.get_global_todos_file()
        if not todos_file.exists():
            return []
        
        try:
            with open(todos_file, 'r', encoding='utf-8') as f:
                encrypted_content = f.read()
            
            decrypted_content = self.encryption_manager.decrypt(encrypted_content)
            return json.loads(decrypted_content)
        except Exception as e:
            print(f"Ошибка чтения глобального TODO: {e}")
            return []
    
    def save_global_todos(self, todos: List[Dict]) -> bool:
        """
        Сохраняет глобальный TODO в зашифрованный файл
        
        Args:
            todos: Список задач TODO
            
        Returns:
            True если успешно
        """
        if not self.encryption_manager:
            raise ValueError("EncryptionManager не установлен")
        
        try:
            todos_json = json.dumps(todos, ensure_ascii=False, indent=2)
            encrypted_content = self.encryption_manager.encrypt(todos_json)
            
            todos_file = self.get_global_todos_file()
            with open(todos_file, 'w', encoding='utf-8') as f:
                f.write(encrypted_content)
            
            return True
        except Exception as e:
            print(f"Ошибка сохранения глобального TODO: {e}")
            return False
    
    # ========== МЕТОДЫ ДЛЯ РАБОТЫ СО СВЯЗЯМИ ЗАМЕТОК ==========
    
    def get_note_links(self, note_id: str) -> List[str]:
        """
        Получает список связанных заметок
        
        Args:
            note_id: ID заметки
            
        Returns:
            Список ID связанных заметок
        """
        metadata = self._load_metadata()
        if note_id in metadata["notes"]:
            return metadata["notes"][note_id].get("links", [])
        return []
    
    def add_note_link(self, note_id: str, linked_note_id: str) -> bool:
        """
        Добавляет связь между заметками
        
        Args:
            note_id: ID заметки
            linked_note_id: ID связанной заметки
            
        Returns:
            True если успешно
        """
        if note_id == linked_note_id:
            return False  # Нельзя связать заметку с самой собой
        
        try:
            metadata = self._load_metadata()
            if note_id not in metadata["notes"]:
                return False
            
            if "links" not in metadata["notes"][note_id]:
                metadata["notes"][note_id]["links"] = []
            
            # Проверяем, что связи еще нет
            if linked_note_id not in metadata["notes"][note_id]["links"]:
                metadata["notes"][note_id]["links"].append(linked_note_id)
                metadata["notes"][note_id]["modified"] = self._get_timestamp()
                self._save_metadata(metadata)
            
            return True
        except Exception as e:
            print(f"Ошибка добавления связи: {e}")
            return False
    
    def remove_note_link(self, note_id: str, linked_note_id: str) -> bool:
        """
        Удаляет связь между заметками
        
        Args:
            note_id: ID заметки
            linked_note_id: ID связанной заметки
            
        Returns:
            True если успешно
        """
        try:
            metadata = self._load_metadata()
            if note_id not in metadata["notes"]:
                return False
            
            if "links" not in metadata["notes"][note_id]:
                return False
            
            if linked_note_id in metadata["notes"][note_id]["links"]:
                metadata["notes"][note_id]["links"].remove(linked_note_id)
                metadata["notes"][note_id]["modified"] = self._get_timestamp()
                self._save_metadata(metadata)
            
            return True
        except Exception as e:
            print(f"Ошибка удаления связи: {e}")
            return False
    
    def update_note_links(self, note_id: str, links: List[str]) -> bool:
        """
        Обновляет список связей заметки
        
        Args:
            note_id: ID заметки
            links: Список ID связанных заметок
            
        Returns:
            True если успешно
        """
        try:
            metadata = self._load_metadata()
            if note_id not in metadata["notes"]:
                return False
            
            # Удаляем связи с самой собой
            links = [link_id for link_id in links if link_id != note_id]
            
            metadata["notes"][note_id]["links"] = links
            metadata["notes"][note_id]["modified"] = self._get_timestamp()
            self._save_metadata(metadata)
            
            return True
        except Exception as e:
            print(f"Ошибка обновления связей: {e}")
            return False
    
    def get_graph_data(self) -> Dict:
        """
        Получает данные для графа заметок
        
        Returns:
            Словарь с nodes (заметки) и edges (связи)
        """
        all_notes = self.list_notes()
        nodes = []
        edges = []
        
        for note in all_notes:
            nodes.append({
                "id": note["id"],
                "title": note["title"],
                "tags": note.get("tags", []),
                "type": note.get("type", "text")
            })
            
            # Получаем связи
            links = self.get_note_links(note["id"])
            for linked_id in links:
                edges.append({
                    "source": note["id"],
                    "target": linked_id
                })
        
        return {
            "nodes": nodes,
            "edges": edges
        }
    
    # ========== МЕТОДЫ ДЛЯ РАБОТЫ С КАЛЕНДАРЕМ ==========
    
    def get_calendar_file(self) -> Path:
        """Получает путь к файлу календаря"""
        return self.notes_dir / "calendar.enc"
    
    def get_calendar_events(self) -> Dict:
        """
        Получает события календаря
        
        Returns:
            Словарь {date: [events]} где events - список событий
        """
        if not self.encryption_manager:
            raise ValueError("EncryptionManager не установлен")
        
        calendar_file = self.get_calendar_file()
        if not calendar_file.exists():
            return {}
        
        try:
            with open(calendar_file, 'r', encoding='utf-8') as f:
                encrypted_content = f.read()
            
            decrypted_content = self.encryption_manager.decrypt(encrypted_content)
            return json.loads(decrypted_content)
        except Exception as e:
            print(f"Ошибка чтения календаря: {e}")
            return {}
    
    def save_calendar_events(self, events: Dict) -> bool:
        """
        Сохраняет события календаря
        
        Args:
            events: Словарь {date: [events]}
            
        Returns:
            True если успешно
        """
        if not self.encryption_manager:
            raise ValueError("EncryptionManager не установлен")
        
        try:
            events_json = json.dumps(events, ensure_ascii=False, indent=2)
            encrypted_content = self.encryption_manager.encrypt(events_json)
            
            calendar_file = self.get_calendar_file()
            with open(calendar_file, 'w', encoding='utf-8') as f:
                f.write(encrypted_content)
            
            return True
        except Exception as e:
            print(f"Ошибка сохранения календаря: {e}")
            return False
    
    def add_calendar_event(self, date: str, event: Dict) -> bool:
        """
        Добавляет событие в календарь
        
        Args:
            date: Дата в формате YYYY-MM-DD
            event: Словарь с данными события {id, title, description, important}
            
        Returns:
            True если успешно
        """
        events = self.get_calendar_events()
        if date not in events:
            events[date] = []
        
        events[date].append(event)
        return self.save_calendar_events(events)
    
    def update_calendar_event(self, date: str, event_id: str, event: Dict) -> bool:
        """
        Обновляет событие в календаре
        
        Args:
            date: Дата в формате YYYY-MM-DD
            event_id: ID события
            event: Обновленные данные события
            
        Returns:
            True если успешно
        """
        events = self.get_calendar_events()
        if date not in events:
            return False
        
        for i, e in enumerate(events[date]):
            if e.get('id') == event_id:
                events[date][i] = event
                return self.save_calendar_events(events)
        
        return False
    
    def remove_calendar_event(self, date: str, event_id: str) -> bool:
        """
        Удаляет событие из календаря
        
        Args:
            date: Дата в формате YYYY-MM-DD
            event_id: ID события
            
        Returns:
            True если успешно
        """
        events = self.get_calendar_events()
        if date not in events:
            return False
        
        original_count = len(events[date])
        events[date] = [e for e in events[date] if e.get('id') != event_id]
        new_count = len(events[date])
        
        if new_count == 0:
            del events[date]
        
        if new_count != original_count:
            return self.save_calendar_events(events)
        
        return False
    
    def mark_day_important(self, date: str, important: bool = True) -> bool:
        """
        Отмечает день как важный
        
        Args:
            date: Дата в формате YYYY-MM-DD
            important: True если важный, False если нет
            
        Returns:
            True если успешно
        """
        events = self.get_calendar_events()
        if date not in events:
            events[date] = []
        
        # Ищем специальное событие для отметки важности
        important_event = None
        for event in events[date]:
            if event.get('type') == 'important_marker':
                important_event = event
                break
        
        if important and not important_event:
            # Добавляем маркер важности
            import uuid
            events[date].append({
                'id': str(uuid.uuid4()),
                'type': 'important_marker',
                'important': True
            })
        elif not important and important_event:
            # Удаляем маркер важности
            events[date] = [e for e in events[date] if e.get('id') != important_event.get('id')]
            if len(events[date]) == 0:
                del events[date]
        
        return self.save_calendar_events(events)
    
    def is_day_important(self, date: str) -> bool:
        """
        Проверяет, отмечен ли день как важный
        
        Args:
            date: Дата в формате YYYY-MM-DD
            
        Returns:
            True если день отмечен как важный
        """
        events = self.get_calendar_events()
        if date not in events:
            return False
        
        for event in events[date]:
            if event.get('type') == 'important_marker':
                return True
        
        return False
    
    # ========== МЕТОДЫ ДЛЯ РАБОТЫ С ИСТОРИЕЙ ЗАХОДОВ ==========
    
    def log_access(self, note_id: str, action: str = 'open') -> bool:
        """
        Логирует действие с заметкой
        
        Args:
            note_id: ID заметки
            action: Действие ('open', 'edit', 'create', 'delete')
            
        Returns:
            True если успешно
        """
        try:
            metadata = self._load_metadata()
            if 'access_history' not in metadata:
                metadata['access_history'] = []
            
            history_entry = {
                'date': self._get_timestamp(),
                'note_id': note_id,
                'action': action
            }
            
            metadata['access_history'].append(history_entry)
            
            # Ограничиваем историю последними 100 записями
            if len(metadata['access_history']) > 100:
                metadata['access_history'] = metadata['access_history'][-100:]
            
            self._save_metadata(metadata)
            return True
        except Exception as e:
            print(f"Ошибка логирования доступа: {e}")
            return False
    
    def get_access_history(self, limit: int = 20) -> List[Dict]:
        """
        Получает историю заходов
        
        Args:
            limit: Максимальное количество записей
            
        Returns:
            Список записей истории
        """
        metadata = self._load_metadata()
        history = metadata.get('access_history', [])
        
        # Возвращаем последние записи
        return history[-limit:] if len(history) > limit else history
    
    # ========== МЕТОДЫ ДЛЯ СВЯЗИ ЗАМЕТОК И КАЛЕНДАРЯ ==========
    
    def link_note_to_date(self, note_id: str, date: str) -> bool:
        """
        Привязывает заметку к дате календаря
        
        Args:
            note_id: ID заметки
            date: Дата в формате YYYY-MM-DD
            
        Returns:
            True если успешно
        """
        try:
            # Обновляем метаданные заметки
            metadata = self._load_metadata()
            if note_id not in metadata["notes"]:
                return False
            
            metadata["notes"][note_id]["linked_date"] = date
            self._save_metadata(metadata)
            
            # Добавляем событие в календарь
            note_title = metadata["notes"][note_id].get("title", "Без названия")
            import uuid
            event = {
                'id': f"note_link_{note_id}",
                'type': 'note_link',
                'note_id': note_id,
                'note_title': note_title
            }
            
            events = self.get_calendar_events()
            if date not in events:
                events[date] = []
            
            # Удаляем старую связь этой заметки если есть
            events[date] = [e for e in events[date] if e.get('note_id') != note_id]
            events[date].append(event)
            self.save_calendar_events(events)
            
            return True
        except Exception as e:
            print(f"Ошибка привязки заметки к дате: {e}")
            return False
    
    def unlink_note_from_date(self, note_id: str) -> bool:
        """
        Отвязывает заметку от даты календаря
        
        Args:
            note_id: ID заметки
            
        Returns:
            True если успешно
        """
        try:
            # Получаем текущую привязанную дату
            metadata = self._load_metadata()
            if note_id not in metadata["notes"]:
                return False
            
            linked_date = metadata["notes"][note_id].get("linked_date")
            
            # Удаляем привязку из метаданных
            if "linked_date" in metadata["notes"][note_id]:
                del metadata["notes"][note_id]["linked_date"]
                self._save_metadata(metadata)
            
            # Удаляем событие из календаря
            if linked_date:
                events = self.get_calendar_events()
                if linked_date in events:
                    events[linked_date] = [e for e in events[linked_date] if e.get('note_id') != note_id]
                    if len(events[linked_date]) == 0:
                        del events[linked_date]
                    self.save_calendar_events(events)
            
            return True
        except Exception as e:
            print(f"Ошибка отвязки заметки от даты: {e}")
            return False
    
    def get_note_linked_date(self, note_id: str) -> Optional[str]:
        """
        Получает дату привязанную к заметке
        
        Args:
            note_id: ID заметки
            
        Returns:
            Дата в формате YYYY-MM-DD или None
        """
        metadata = self._load_metadata()
        if note_id in metadata["notes"]:
            return metadata["notes"][note_id].get("linked_date")
        return None
    
    def get_notes_for_date(self, date: str) -> List[Dict]:
        """
        Получает заметки привязанные к дате
        
        Args:
            date: Дата в формате YYYY-MM-DD
            
        Returns:
            Список заметок [{id, title}]
        """
        events = self.get_calendar_events()
        notes = []
        
        if date in events:
            for event in events[date]:
                if event.get('type') == 'note_link':
                    notes.append({
                        'id': event.get('note_id'),
                        'title': event.get('note_title', 'Без названия')
                    })
        
        return notes
    
    def get_all_date_note_links(self) -> Dict[str, List[Dict]]:
        """
        Получает все связи дат и заметок
        
        Returns:
            Словарь {date: [{id, title}]}
        """
        events = self.get_calendar_events()
        links = {}
        
        for date, date_events in events.items():
            notes = []
            for event in date_events:
                if event.get('type') == 'note_link':
                    notes.append({
                        'id': event.get('note_id'),
                        'title': event.get('note_title', 'Без названия')
                    })
            if notes:
                links[date] = notes
        
        return links
