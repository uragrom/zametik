import os
import hashlib
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend


class EncryptionManager:
    
    def __init__(self, password: str):
        self.password = password.encode('utf-8')
        self.backend = default_backend()
    
    def _derive_key(self, salt: bytes) -> bytes:

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=self.backend
        )
        return kdf.derive(self.password)
    
    def _generate_salt(self) -> bytes:
        return os.urandom(16)
    
    def _calculate_hash(self, data: bytes) -> str:

        return hashlib.sha256(data).hexdigest()
    
    def encrypt(self, plaintext: str) -> str:
        salt = self._generate_salt()
        
        key = self._derive_key(salt)
        
        aesgcm = AESGCM(key)
        
        nonce = os.urandom(12)
        
        plaintext_bytes = plaintext.encode('utf-8')
        ciphertext = aesgcm.encrypt(nonce, plaintext_bytes, None)
        
        data_hash_hex = self._calculate_hash(plaintext_bytes)
        
        combined = salt + nonce + ciphertext + data_hash_hex.encode('utf-8')
        
        return base64.b64encode(combined).decode('utf-8')
    
    def decrypt(self, encrypted_data: str) -> str:
        try:
            if not encrypted_data or len(encrypted_data.strip()) == 0:
                raise ValueError("Пустые данные для расшифровки")
            
            # Декодируем из base64
            try:
                combined = base64.b64decode(encrypted_data.encode('utf-8'))
            except Exception as e:
                raise ValueError(f"Ошибка декодирования base64: {str(e)}")
            
            # Проверяем минимальный размер данных
            # salt (16) + nonce (12) + hash (64) = минимум 92 байта
            if len(combined) < 92:
                raise ValueError(f"Данные слишком короткие: {len(combined)} байт (минимум 92)")
            
            # Извлекаем компоненты
            salt = combined[0:16]
            nonce = combined[16:28]
            # Хеш в hex формате занимает 64 байта (64 символа)
            hash_bytes = combined[-64:]
            ciphertext = combined[28:-64]
            
            # Проверяем, что есть данные для расшифровки
            if len(ciphertext) == 0:
                raise ValueError("Нет данных для расшифровки")
            
            # Выводим ключ из пароля
            key = self._derive_key(salt)
            
            # Создаем AES-GCM шифр
            aesgcm = AESGCM(key)
            
            # Расшифровываем
            try:
                plaintext_bytes = aesgcm.decrypt(nonce, ciphertext, None)
            except Exception as e:
                error_type = type(e).__name__
                error_msg = str(e)
                # InvalidTag означает неверный пароль или поврежденные данные
                if error_type == "InvalidTag" or "invalidtag" in error_msg.lower():
                    raise ValueError(f"Неверный пароль - данные не могут быть расшифрованы с текущим паролем. Возможно, заметка была создана с другим паролем.")
                elif "decryption failed" in error_msg.lower() or "authentication" in error_msg.lower():
                    raise ValueError(f"Неверный пароль или поврежденные данные. Детали: {error_type}: {error_msg}")
                else:
                    raise ValueError(f"Ошибка AES-GCM расшифровки: {error_type}: {error_msg}")
            
            # Проверяем целостность
            expected_hash = self._calculate_hash(plaintext_bytes)
            try:
                actual_hash = hash_bytes.decode('utf-8')
            except Exception as e:
                raise ValueError(f"Ошибка декодирования хеша: {str(e)}")
            
            if expected_hash != actual_hash:
                raise ValueError("Целостность данных нарушена - хеши не совпадают")
            
            return plaintext_bytes.decode('utf-8')
            
        except ValueError as e:
            # Передаем ValueError как есть, без оборачивания
            raise
        except Exception as e:
            # Другие исключения оборачиваем
            raise ValueError(f"Неожиданная ошибка расшифровки: {type(e).__name__}: {str(e)}")
    
    def hash_data(self, data: str) -> str:
        return self._calculate_hash(data.encode('utf-8'))

