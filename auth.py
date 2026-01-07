"""
Модуль аутентификации
Управление паролями и сессиями
"""
import os
import bcrypt
import json
from pathlib import Path


class AuthManager:
    """Менеджер аутентификации"""
    
    def __init__(self, config_file: str = "auth_config.json"):
        """
        Инициализация менеджера аутентификации
        
        Args:
            config_file: Путь к файлу с хешем пароля
        """
        self.config_file = config_file
        self.config_path = Path(config_file)
        self._ensure_config_exists()
    
    def _ensure_config_exists(self):
        """Создает файл конфигурации, если его нет"""
        if not self.config_path.exists():
            # Создаем пустой конфиг
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump({}, f)
    
    def hash_password(self, password: str) -> str:
        """
        Хеширует пароль используя bcrypt
        
        Args:
            password: Пароль в открытом виде
            
        Returns:
            Хешированный пароль
        """
        salt = bcrypt.gensalt(rounds=12)
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def verify_password(self, password: str, hashed: str) -> bool:
        """
        Проверяет пароль
        
        Args:
            password: Пароль для проверки
            hashed: Хешированный пароль
            
        Returns:
            True если пароль верный
        """
        try:
            return bcrypt.checkpw(
                password.encode('utf-8'),
                hashed.encode('utf-8')
            )
        except Exception:
            return False
    
    def set_password(self, password: str) -> bool:
        """
        Устанавливает новый пароль
        
        Args:
            password: Новый пароль
            
        Returns:
            True если успешно
        """
        try:
            hashed = self.hash_password(password)
            config = {}
            if self.config_path.exists():
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
            
            config['password_hash'] = hashed
            config['initialized'] = True
            
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2)
            
            return True
        except Exception as e:
            print(f"Ошибка установки пароля: {e}")
            return False
    
    def check_password(self, password: str) -> bool:
        """
        Проверяет пароль пользователя
        
        Args:
            password: Пароль для проверки
            
        Returns:
            True если пароль верный
        """
        try:
            if not self.config_path.exists():
                return False
            
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            if 'password_hash' not in config:
                return False
            
            return self.verify_password(password, config['password_hash'])
        except Exception:
            return False
    
    def is_initialized(self) -> bool:
        """
        Проверяет, инициализирована ли система (есть ли пароль)
        
        Returns:
            True если система инициализирована
        """
        try:
            if not self.config_path.exists():
                return False
            
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            return config.get('initialized', False)
        except Exception:
            return False
    
    def reset_password(self, old_password: str, new_password: str) -> bool:
        """
        Сбрасывает пароль (требует старый пароль)
        
        Args:
            old_password: Текущий пароль
            new_password: Новый пароль
            
        Returns:
            True если успешно
        """
        if not self.check_password(old_password):
            return False
        
        return self.set_password(new_password)

