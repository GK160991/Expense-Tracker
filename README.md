# Manage Expense

A full-stack expense tracker web application built with Node.js, Express, and SQLite.

## Features

- User sign up / log in / log out with session-based authentication
- Forgot password / reset password flow
- Add, edit, and delete expenses
- Filter expenses by category and date range
- Dashboard with total spend, current-month spend, and spend by category
- Monthly budget tracking with usage warnings
- Responsive, colorful UI

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite (via Node's built-in `node:sqlite`)
- **Frontend:** Static HTML/CSS/Vanilla JS (served by Express)
- **Auth:** express-session, Node `crypto.scrypt` password hashing

## Project Structure

```
Application/
  PLAN.md
  README.md
  package.json
  server.js
  db.js
  auth.js
  public/
    index.html
    style.css
    app.js
```

## Getting Started

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser.

## Environment Variables

- `PORT` - port to run the server on (default: 3000)
- `SESSION_SECRET` - secret used to sign session cookies (set a strong value in production)

## API Overview

- `POST /api/auth/register` - create an account (first name, last name, email, password)
- `POST /api/auth/login` - log in with email and password
- `POST /api/auth/logout` - log out
- `GET /api/auth/me` - get the current session's user
- `POST /api/auth/forgot-password` - request a password reset token
- `POST /api/auth/reset-password` - reset password using a token
- `GET /api/expenses` - list expenses (supports `?category=&from=&to=`)
- `POST /api/expenses` - create an expense
- `PUT /api/expenses/:id` - update an expense
- `DELETE /api/expenses/:id` - delete an expense
- `GET /api/expenses/summary` - totals by category, grand total, and budget usage
- `GET /api/settings` / `PUT /api/settings` - get/update the monthly budget

See [PLAN.md](PLAN.md) for the original project plan.
