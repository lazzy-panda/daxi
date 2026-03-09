# Daxi — AI-Powered Learning Platform

Платформа для создания тестов, онбординга и оценки знаний с AI-грейдингом, карточками и спейсд репетишн.

## Стек

| Слой | Технология |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, SQLite |
| Vector DB | ChromaDB |
| AI | OpenAI GPT-4o-mini + text-embedding-3-small |
| Frontend | React Native, Expo SDK 51, Expo Router |
| Web | React Native Web |
| Auth | JWT (python-jose + passlib/bcrypt) |

---

## Запуск

### 1. Backend

```bash
cd backend

# Создать виртуальное окружение (один раз)
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Настроить переменные окружения (один раз)
cp .env.example .env
# Открыть .env и вписать OPENAI_API_KEY (можно оставить пустым — будет mock-режим)

# Запустить сервер
./start.sh
# или: uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Сервер: http://localhost:8000
Swagger UI: http://localhost:8000/docs

---

### 2. Frontend

```bash
cd frontend
npm install

npm run web       # браузер → http://localhost:8081
npm run ios       # iOS симулятор
npm run android   # Android эмулятор
```

---

### 3. Первый запуск — создать куратора

Первый куратор добавляется вручную через API (потом все управление через UI).

```bash
# 1. Добавить email в allowlist как curator
curl -X POST http://localhost:8000/api/allowlist \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "role": "curator"}'

# 2. Зарегистрироваться на фронте с этим email
# 3. Войти → попадёте в панель куратора
```

Дальше куратор через UI управляет allowlist'ом и добавляет пользователей сам.

---

## Переменные окружения (`backend/.env`)

| Переменная | Описание | По умолчанию |
|---|---|---|
| `OPENAI_API_KEY` | Ключ OpenAI. Без него — mock-режим | — |
| `SECRET_KEY` | Секрет для подписи JWT | `changeme-...` |
| `DATABASE_URL` | Путь к SQLite базе | `sqlite:///./daxi.db` |
| `CHROMA_PATH` | Хранилище ChromaDB | `./chroma_db` |
| `UPLOAD_DIR` | Папка для загруженных файлов | `./uploads` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Срок жизни токена (мин) | `1440` (24 ч) |

---

## Роли и возможности

### Куратор
- Управление allowlist — кто может зарегистрироваться
- Загрузка документов (PDF, DOCX, TXT, изображения)
- AI-генерация вопросов и карточек из документов
- Ручное создание, редактирование, удаление вопросов и карточек
- Импорт вопросов/карточек через JSON или CSV
- Просмотр всех результатов экзаменов с AI-фидбеком
- Уведомления о завершённых экзаменах

### Examineе
- Регистрация (только по allowlist)
- Экзамен: 10 случайных открытых вопросов
- Cooldown 72 часа между попытками
- Порог прохождения: 85%
- AI-грейдинг: 0–10 баллов за ответ + объяснение + советы
- Изучение карточек со spaced repetition (SM2: Hard→1d, Medium→3d, Easy→7d)
- Авто-генерация remediation карточек при ответах < 7/10

---

## API

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/allowlist               (curator)
POST   /api/allowlist               (curator)
DELETE /api/allowlist/{id}          (curator)

POST   /api/documents/upload        (curator)
GET    /api/documents               (curator)
GET    /api/documents/{id}/status   (curator)
DELETE /api/documents/{id}          (curator)

GET    /api/questions               (curator)
POST   /api/questions               (curator)
PUT    /api/questions/{id}          (curator)
DELETE /api/questions/{id}          (curator)
POST   /api/questions/generate      (curator, AI)
POST   /api/questions/import/json   (curator)
POST   /api/questions/import/csv    (curator)

GET    /api/flashcards              (curator)
POST   /api/flashcards              (curator)
DELETE /api/flashcards/{id}         (curator)
POST   /api/flashcards/generate     (curator, AI)
POST   /api/flashcards/import/json  (curator)
GET    /api/flashcards/study        (examinee — карточки к повторению)
POST   /api/flashcards/{id}/review  (examinee — оценить карточку)

GET    /api/exams/eligibility
POST   /api/exams/start
POST   /api/exams/{session_id}/submit
GET    /api/exams/results/{session_id}
GET    /api/exams/history           (examinee)

GET    /api/results                 (curator — все результаты)
GET    /api/results/{session_id}

GET    /api/notifications
GET    /api/notifications/unread-count
PATCH  /api/notifications/{id}/read
POST   /api/notifications/read-all
DELETE /api/notifications/{id}
```

---

## Тесты

```bash
cd backend
source venv/bin/activate
python -m pytest tests/test_api.py -v
```

65 тестов, изолированная in-memory SQLite база. Покрыты все endpoints: auth, allowlist, documents, questions, flashcards, exams, results, notifications.

---

## Структура проекта

```
daxi/
├── backend/
│   ├── main.py              # точка входа FastAPI
│   ├── models.py            # SQLAlchemy модели
│   ├── schemas.py           # Pydantic схемы
│   ├── config.py            # настройки через .env
│   ├── database.py          # подключение к БД
│   ├── dependencies.py      # auth dependencies (require_curator и др.)
│   ├── routers/             # API роутеры по доменам
│   │   ├── auth.py
│   │   ├── allowlist.py
│   │   ├── documents.py
│   │   ├── questions.py
│   │   ├── flashcards.py
│   │   ├── exams.py
│   │   ├── results.py
│   │   └── notifications.py
│   ├── services/            # бизнес-логика и AI
│   │   ├── ai_service.py
│   │   ├── document_service.py
│   │   ├── embedding_service.py
│   │   └── spaced_repetition.py
│   ├── tests/
│   │   └── test_api.py
│   ├── requirements.txt
│   ├── start.sh
│   └── .env.example
└── frontend/
    ├── app/                 # Expo Router (file-based routing)
    │   ├── (auth)/          # login, register
    │   ├── (curator)/       # curator screens
    │   └── (examinee)/      # examinee screens
    ├── services/            # API клиент
    ├── components/          # shared UI компоненты
    ├── constants/           # theme, colors
    └── context/             # AuthContext
```
