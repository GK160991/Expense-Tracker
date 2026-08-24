# Manage Expense – Implementation Plan

## Overview
A simple full-stack expense tracker web application to record, view, edit,
delete, and summarize personal expenses.

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** SQLite (file-based, via `better-sqlite3`)
- **Frontend:** Static HTML/CSS/Vanilla JS (served by Express)
- **API:** REST endpoints under `/api/expenses`

## Features
1. Add an expense (description, amount, category, date)
2. List all expenses (sortable by date)
3. Edit an existing expense
4. Delete an expense
5. Summary dashboard: total spend, spend by category
6. Filter expenses by category and date range

## Data Model
`expenses` table:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `description` TEXT NOT NULL
- `amount` REAL NOT NULL
- `category` TEXT NOT NULL
- `date` TEXT NOT NULL (ISO date)
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

## API Endpoints
- `GET /api/expenses` – list (supports `?category=&from=&to=`)
- `GET /api/expenses/summary` – totals by category + grand total
- `POST /api/expenses` – create
- `PUT /api/expenses/:id` – update
- `DELETE /api/expenses/:id` – delete

## Project Structure
```
Application/
  PLAN.md
  package.json
  server.js
  db.js
  public/
    index.html
    style.css
    app.js
```

## Steps
1. Scaffold `package.json`, install `express` and `better-sqlite3`.
2. Implement `db.js` to initialize SQLite DB and table.
3. Implement `server.js` with REST API routes.
4. Build static frontend (`public/index.html`, `style.css`, `app.js`) with
   a form to add expenses, a table to list/edit/delete, and a summary panel.
5. Test API endpoints and UI manually (start server, use browser).
