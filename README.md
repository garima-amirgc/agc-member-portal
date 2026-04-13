# Internal LMS (Udemy-like)

Full-stack Learning Management System for internal company use.

## Stack
- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: SQLite via **`sql.js`** (WebAssembly, no native compiler / Visual Studio required on Windows)
- Video storage: local filesystem (`backend/uploads`)

## Features Implemented
- Role-based authentication (`Admin`, `Manager`, `Employee`)
- Business unit isolation (`AGC`, `AQM`, `SCF`, `ASP`)
- Admin user CRUD with manager assignment
- Course CRUD by business unit
- Lessons CRUD with video URL/order
- Video upload with `multer` and local storage
- Course assignment to users with status/progress
- Lesson completion tracking, last watched lesson, course completion
- Completion message (`You have completed the training`)
- Manager notification simulation via console log
- Modern responsive UI with dashboard, course player, admin panel, and dark mode toggle

## Project Structure
```
backend/
  src/
    config/
    middleware/
    routes/
    services/
  uploads/
frontend/
  src/
    components/
    context/
    pages/
    services/
```

## Run Locally

### 1) Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs on `http://localhost:5000`

Default seeded admin:
- Email: `admin@company.com`
- Password: `admin123`

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

Optional frontend env:
```bash
VITE_API_URL=http://localhost:5000
```

## API Endpoints
- `POST /auth/login`
- `POST /auth/register` (Admin only)
- `GET/POST/PUT/DELETE /users` (Admin)
- `GET/POST/PUT/DELETE /courses`
- `GET/POST/PUT/DELETE /lessons` (includes `GET /lessons/course/:courseId`)
- `GET /assignments/me`
- `GET /assignments`
- `POST /assignments`
- `POST /assignments/:id/progress`
- `POST /upload` (Admin, multipart field `video`)

## Designed for Easy Migration
- **SQLite -> PostgreSQL**: DB logic is centralized in `backend/src/config/db.js` (sync wrapper). Replace it with `pg` or an ORM while keeping route handlers mostly unchanged.
- **Local storage -> S3/R2**: storage concerns are isolated in `backend/src/services/storage.service.js` and upload route logic can swap to cloud SDKs without route contract changes.

### Windows note (Node 24+)
This backend uses **`sql.js`** instead of `better-sqlite3` so `npm install` does not require Visual Studio C++ build tools.
