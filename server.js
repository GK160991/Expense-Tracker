require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const nodemailer = require('nodemailer');
const { query } = require('./db');
const { hashPassword, verifyPassword, generateResetToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function sendResetEmail(email, token) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('GMAIL_USER or GMAIL_APP_PASSWORD is not configured. Password reset email was not sent.');
    return Promise.resolve(false);
  }

  const resetUrl = `${(process.env.APP_BASE_URL || 'http://localhost:3000')}/?reset_token=${encodeURIComponent(token)}`;

  return transporter.sendMail({
    from: `Manage Expense <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Reset your password',
    text: `Use the following link to reset your password: ${resetUrl}\n\nThis link expires in 15 minutes.`,
    html: `
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 15 minutes.</p>
    `,
  });
}

function sendLoginEmail(email, firstName) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('GMAIL_USER or GMAIL_APP_PASSWORD is not configured. Login email was not sent.');
    return Promise.resolve(false);
  }

  return transporter.sendMail({
    from: `Manage Expense <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Welcome back to Manage Expense',
    text: `Hello ${firstName},\n\nYou have successfully logged in to Manage Expense.`,
    html: `
      <p>Hello ${firstName},</p>
      <p>You have successfully logged in to Manage Expense.</p>
    `,
  });
}

app.set('trust proxy', 1);
app.use(express.json());
app.use(
  session({
    name: 'manage-expense.sid',
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

// blocks unauthenticated access to per-user data endpoints
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  next();
}

// ---- Auth routes ----

app.post('/api/auth/register', async (req, res) => {
  const firstName = typeof req.body.firstName === 'string' ? req.body.firstName.trim() : '';
  const lastName = typeof req.body.lastName === 'string' ? req.body.lastName.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const errors = [];
  if (!firstName) errors.push('First name is required.');
  else if (firstName.length > 50) errors.push('First name must be 50 characters or fewer.');
  if (!lastName) errors.push('Last name is required.');
  else if (lastName.length > 50) errors.push('Last name must be 50 characters or fewer.');
  if (!EMAIL_RE.test(email)) errors.push('A valid email address is required.');
  if (password.length < 6) errors.push('Password must be at least 6 characters.');

  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = hashPassword(password);
  const result = await query(
    'INSERT INTO users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
    [firstName, lastName, email, passwordHash]
  );

  await query('INSERT INTO user_settings (user_id, monthly_budget) VALUES ($1, 0)', [result.rows[0].id]);

  res.status(201).json({ message: 'Sign up successful. Please log in with your email and password.' });
});

app.post('/api/auth/login', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const userResult = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = userResult.rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  req.session.userId = user.id;
  req.session.firstName = user.first_name;
  req.session.lastName = user.last_name;
  req.session.email = user.email;

  sendLoginEmail(user.email, user.first_name).catch((error) => {
    console.error('Failed to send login email:', error);
  });

  res.json({ firstName: user.first_name, lastName: user.last_name, email: user.email });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('manage-expense.sid');
    res.status(204).send();
  });
});

// requests a reset token for an email; same response whether or not the email exists, to avoid leaking registered accounts
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const genericMessage = 'If that email is registered, a password reset email has been sent.';
  const userResult = await query('SELECT id, email FROM users WHERE email = $1', [email]);
  const user = userResult.rows[0];
  if (!user) {
    return res.json({ message: genericMessage });
  }

  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  await query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);
  await query('INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, user.id, expiresAt]);

  try {
    await sendResetEmail(email, token);
    return res.json({ message: genericMessage });
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return res.status(500).json({ error: 'Unable to send password reset email right now. Please try again later.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!token) {
    return res.status(400).json({ error: 'Reset token is required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const recordResult = await query('SELECT * FROM password_resets WHERE token = $1', [token]);
  const record = recordResult.rows[0];
  if (!record || new Date(record.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'That reset token is invalid or has expired.' });
  }

  const passwordHash = hashPassword(password);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, record.user_id]);
  await query('DELETE FROM password_resets WHERE token = $1', [token]);
  res.json({ message: 'Password updated. You can now log in.' });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  res.json({ firstName: req.session.firstName, lastName: req.session.lastName, email: req.session.email });
});

// shared validation for expense payloads; returns a list of human-readable errors
function validateExpense(body) {
  const errors = [];
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const amount = Number(body.amount);

  if (!description) errors.push('Description is required.');
  else if (description.length > 200) errors.push('Description must be 200 characters or fewer.');

  if (!category) errors.push('Category is required.');
  else if (category.length > 50) errors.push('Category must be 50 characters or fewer.');

  if (body.amount == null || body.amount === '') errors.push('Amount is required.');
  else if (Number.isNaN(amount)) errors.push('Amount must be a valid number.');
  else if (amount <= 0) errors.push('Amount must be greater than zero.');

  if (!date) errors.push('Date is required.');
  else if (!DATE_RE.test(date) || Number.isNaN(new Date(date).getTime())) {
    errors.push('Date must be a valid date (YYYY-MM-DD).');
  }

  return { errors, value: { description, category, date, amount } };
}

// GET /api/expenses - list, supports ?category=&from=&to=
app.get('/api/expenses', requireAuth, async (req, res) => {
  const { category, from, to } = req.query;
  let sql = 'SELECT * FROM expenses WHERE user_id = $1';
  const params = [req.session.userId];

  if (category) {
    sql += ' AND category = $' + (params.length + 1);
    params.push(category);
  }
  if (from) {
    sql += ' AND date >= $' + (params.length + 1);
    params.push(from);
  }
  if (to) {
    sql += ' AND date <= $' + (params.length + 1);
    params.push(to);
  }
  sql += ' ORDER BY date DESC, id DESC';

  const result = await query(sql, params);
  res.json(result.rows);
});

// GET /api/expenses/summary - totals by category, grand total, and current-month budget usage
app.get('/api/expenses/summary', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const byCategoryResult = await query(
    'SELECT category, SUM(amount) AS total FROM expenses WHERE user_id = $1 GROUP BY category ORDER BY total DESC',
    [userId]
  );
  const grandTotalResult = await query('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = $1', [userId]);

  const monthPrefix = new Date().toISOString().slice(0, 7);
  const currentMonthResult = await query(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = $1 AND SUBSTRING(date FROM 1 FOR 7) = $2',
    [userId, monthPrefix]
  );

  const settingsResult = await query('SELECT monthly_budget FROM user_settings WHERE user_id = $1', [userId]);
  const monthlyBudget = settingsResult.rows[0] ? settingsResult.rows[0].monthly_budget : 0;
  const currentMonthTotal = Number(currentMonthResult.rows[0]?.total || 0);
  const budgetUsedPercent = monthlyBudget > 0 ? Math.round((currentMonthTotal / monthlyBudget) * 100) : null;

  res.json({
    byCategory: byCategoryResult.rows,
    grandTotal: Number(grandTotalResult.rows[0]?.total || 0),
    currentMonthTotal,
    monthlyBudget,
    budgetUsedPercent,
  });
});

// GET /api/settings - fetch monthly budget
app.get('/api/settings', requireAuth, async (req, res) => {
  const settingsResult = await query('SELECT monthly_budget FROM user_settings WHERE user_id = $1', [req.session.userId]);
  res.json(settingsResult.rows[0] || { monthly_budget: 0 });
});

// PUT /api/settings - update monthly budget
app.put('/api/settings', requireAuth, async (req, res) => {
  const budget = Number(req.body.monthly_budget);
  if (Number.isNaN(budget) || budget < 0) {
    return res.status(400).json({ error: 'Monthly budget must be a non-negative number.' });
  }
  await query('UPDATE user_settings SET monthly_budget = $1 WHERE user_id = $2', [budget, req.session.userId]);
  res.json({ monthly_budget: budget });
});

// POST /api/expenses - create
app.post('/api/expenses', requireAuth, (req, res) => {
  const { errors, value } = validateExpense(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  const result = db
    .prepare('INSERT INTO expenses (user_id, description, amount, category, date) VALUES (?, ?, ?, ?, ?)')
    .run(req.session.userId, value.description, value.amount, value.category, value.date);

  const created = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.session.userId);
  res.status(201).json(created);
});

// PUT /api/expenses/:id - update
app.put('/api/expenses/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Expense not found.' });
  }

  const { errors, value } = validateExpense(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  db.prepare('UPDATE expenses SET description = ?, amount = ?, category = ?, date = ? WHERE id = ? AND user_id = ?')
    .run(value.description, value.amount, value.category, value.date, id, req.session.userId);

  const updated = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  res.json(updated);
});

// DELETE /api/expenses/:id - delete
app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Expense not found.' });
  }
  db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(id, req.session.userId);
  res.status(204).send();
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Manage Expense running at http://localhost:${PORT}`);
  });
}

module.exports = app;

