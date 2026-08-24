const API_BASE = '/api/expenses';
const SETTINGS_BASE = '/api/settings';

// ---- Tab navigation ----
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    tabPanels.forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ---- Toasts ----
const toastContainer = document.getElementById('toast-container');
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// redirects to the login view when the session has expired mid-use
function handleUnauthorized(res) {
  if (res.status === 401) {
    showAuth();
    showToast('Session expired. Please log in again.', 'error');
    return true;
  }
  return false;
}

// ---- Expense form elements ----
const form = document.getElementById('expense-form');
const idInput = document.getElementById('expense-id');
const descInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const dateInput = document.getElementById('date');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-edit');
const tbody = document.getElementById('expense-tbody');
const noExpenseData = document.getElementById('no-expense-data');

const grandTotalEl = document.getElementById('grand-total');
const monthTotalEl = document.getElementById('month-total');
const categorySummaryEl = document.getElementById('category-summary');
const noCategoryData = document.getElementById('no-category-data');
const budgetProgressWrap = document.getElementById('budget-progress-wrap');
const budgetProgressBar = document.getElementById('budget-progress-bar');
const budgetHint = document.getElementById('budget-hint');

const filterCategory = document.getElementById('filter-category');
const filterFrom = document.getElementById('filter-from');
const filterTo = document.getElementById('filter-to');

const settingsForm = document.getElementById('settings-form');
const monthlyBudgetInput = document.getElementById('monthly-budget');

document.getElementById('apply-filter').addEventListener('click', () => loadExpenses());
document.getElementById('clear-filter').addEventListener('click', () => {
  filterCategory.value = '';
  filterFrom.value = '';
  filterTo.value = '';
  loadExpenses();
});

cancelBtn.addEventListener('click', resetForm);

// ---- Client-side validation ----
function clearFieldErrors() {
  ['description', 'amount', 'category', 'date'].forEach((field) => {
    document.getElementById(`err-${field}`).textContent = '';
    document.getElementById(field).classList.remove('invalid');
  });
}

function setFieldError(field, message) {
  document.getElementById(`err-${field}`).textContent = message;
  document.getElementById(field).classList.add('invalid');
}

function validateExpenseForm() {
  clearFieldErrors();
  let valid = true;

  if (!descInput.value.trim()) {
    setFieldError('description', 'Description is required.');
    valid = false;
  }

  const amount = Number(amountInput.value);
  if (!amountInput.value) {
    setFieldError('amount', 'Amount is required.');
    valid = false;
  } else if (Number.isNaN(amount) || amount <= 0) {
    setFieldError('amount', 'Amount must be greater than zero.');
    valid = false;
  }

  if (!categoryInput.value.trim()) {
    setFieldError('category', 'Category is required.');
    valid = false;
  }

  if (!dateInput.value) {
    setFieldError('date', 'Date is required.');
    valid = false;
  }

  return valid;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateExpenseForm()) {
    showToast('Please fix the highlighted fields.', 'error');
    return;
  }

  const payload = {
    description: descInput.value.trim(),
    amount: amountInput.value,
    category: categoryInput.value.trim(),
    date: dateInput.value,
  };

  const editingId = idInput.value;
  const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
  const method = editingId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Failed to save expense.', 'error');
      return;
    }

    showToast(editingId ? 'Expense updated.' : 'Expense added.', 'success');
    resetForm();
    refreshAll();
  } catch {
    showToast('Network error while saving expense.', 'error');
  }
});

function resetForm() {
  idInput.value = '';
  form.reset();
  clearFieldErrors();
  formTitle.textContent = 'Add Expense';
  submitBtn.textContent = 'Add Expense';
  cancelBtn.hidden = true;
}

function startEdit(expense) {
  idInput.value = expense.id;
  descInput.value = expense.description;
  amountInput.value = expense.amount;
  categoryInput.value = expense.category;
  dateInput.value = expense.date;
  clearFieldErrors();
  formTitle.textContent = 'Edit Expense';
  submitBtn.textContent = 'Update Expense';
  cancelBtn.hidden = false;
  document.querySelector('.tab-btn[data-tab="expenses"]').click();
  descInput.focus();
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  try {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      showToast('Expense deleted.', 'success');
      refreshAll();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Failed to delete expense.', 'error');
    }
  } catch {
    showToast('Network error while deleting expense.', 'error');
  }
}

function buildQuery() {
  const params = new URLSearchParams();
  if (filterCategory.value.trim()) params.set('category', filterCategory.value.trim());
  if (filterFrom.value) params.set('from', filterFrom.value);
  if (filterTo.value) params.set('to', filterTo.value);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function loadExpenses() {
  try {
    const res = await fetch(`${API_BASE}${buildQuery()}`);
    if (handleUnauthorized(res)) return;
    const expenses = await res.json();
    renderExpenses(expenses);
  } catch {
    showToast('Failed to load expenses.', 'error');
  }
}

function renderExpenses(expenses) {
  tbody.innerHTML = '';
  noExpenseData.hidden = expenses.length > 0;
  for (const expense of expenses) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${expense.date}</td>
      <td>${escapeHtml(expense.description)}</td>
      <td>${escapeHtml(expense.category)}</td>
      <td>$${Number(expense.amount).toFixed(2)}</td>
      <td class="actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </td>
    `;
    tr.querySelector('.edit-btn').addEventListener('click', () => startEdit(expense));
    tr.querySelector('.delete-btn').addEventListener('click', () => deleteExpense(expense.id));
    tbody.appendChild(tr);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadSummary() {
  try {
    const res = await fetch(`${API_BASE}/summary`);
    if (handleUnauthorized(res)) return;
    const { byCategory, grandTotal, currentMonthTotal, monthlyBudget, budgetUsedPercent } = await res.json();

    grandTotalEl.textContent = Number(grandTotal).toFixed(2);
    monthTotalEl.textContent = Number(currentMonthTotal).toFixed(2);

    categorySummaryEl.innerHTML = '';
    noCategoryData.hidden = byCategory.length > 0;
    for (const row of byCategory) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${escapeHtml(row.category)}</span><span>$${Number(row.total).toFixed(2)}</span>`;
      categorySummaryEl.appendChild(li);
    }

    // business logic: warn as monthly spend approaches or exceeds the budget
    if (monthlyBudget > 0) {
      budgetProgressWrap.hidden = false;
      const pct = Math.min(budgetUsedPercent, 100);
      budgetProgressBar.style.width = `${pct}%`;
      budgetProgressBar.classList.toggle('over-budget', budgetUsedPercent >= 100);
      budgetProgressBar.classList.toggle('near-budget', budgetUsedPercent >= 80 && budgetUsedPercent < 100);

      if (budgetUsedPercent >= 100) {
        budgetHint.textContent = `You've exceeded your $${monthlyBudget.toFixed(2)} budget (${budgetUsedPercent}%).`;
      } else if (budgetUsedPercent >= 80) {
        budgetHint.textContent = `You've used ${budgetUsedPercent}% of your $${monthlyBudget.toFixed(2)} budget.`;
      } else {
        budgetHint.textContent = `${budgetUsedPercent}% of your $${monthlyBudget.toFixed(2)} budget used.`;
      }
    } else {
      budgetProgressWrap.hidden = true;
      budgetHint.textContent = 'Set a monthly budget in Settings to track usage.';
    }
  } catch {
    showToast('Failed to load summary.', 'error');
  }
}

async function loadSettings() {
  try {
    const res = await fetch(SETTINGS_BASE);
    if (handleUnauthorized(res)) return;
    const settings = await res.json();
    monthlyBudgetInput.value = settings.monthly_budget || '';
  } catch {
    showToast('Failed to load settings.', 'error');
  }
}

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('err-monthly-budget');
  errEl.textContent = '';
  monthlyBudgetInput.classList.remove('invalid');

  const budget = Number(monthlyBudgetInput.value);
  if (monthlyBudgetInput.value === '' || Number.isNaN(budget) || budget < 0) {
    errEl.textContent = 'Enter a valid, non-negative budget amount.';
    monthlyBudgetInput.classList.add('invalid');
    showToast('Please fix the highlighted field.', 'error');
    return;
  }

  try {
    const res = await fetch(SETTINGS_BASE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_budget: budget }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Failed to save budget.', 'error');
      return;
    }
    showToast('Monthly budget saved.', 'success');
    loadSummary();
  } catch {
    showToast('Network error while saving budget.', 'error');
  }
});

async function refreshAll() {
  await Promise.all([loadExpenses(), loadSummary()]);
}

// ---- Auth ----
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const appTabs = document.getElementById('app-tabs');
const userBox = document.getElementById('user-box');
const currentUsernameEl = document.getElementById('current-username');

const authToggleBtns = document.querySelectorAll('.auth-toggle-btn');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const forgotForm = document.getElementById('forgot-form');
const resetPasswordForm = document.getElementById('reset-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const forgotError = document.getElementById('forgot-error');
const resetError = document.getElementById('reset-error');
const resetTokenHint = document.getElementById('reset-token-hint');

const authForms = { login: loginForm, register: registerForm, forgot: forgotForm, reset: resetPasswordForm };

function showAuthStep(step) {
  authToggleBtns.forEach((b) => b.classList.toggle('active', b.dataset.authTab === step));
  Object.entries(authForms).forEach(([name, el]) => {
    el.hidden = name !== step;
  });
}

authToggleBtns.forEach((btn) => {
  btn.addEventListener('click', () => showAuthStep(btn.dataset.authTab));
});

document.getElementById('goto-forgot').addEventListener('click', (e) => {
  e.preventDefault();
  showAuthStep('forgot');
});

document.getElementById('back-to-login').addEventListener('click', () => showAuthStep('login'));

forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  forgotError.textContent = '';
  const email = document.getElementById('forgot-email').value.trim();

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      forgotError.textContent = data.error || 'Failed to request password reset.';
      return;
    }

    showAuthStep('reset');
    if (data.token) {
      document.getElementById('reset-token').value = data.token;
      resetTokenHint.textContent = 'Demo mode: your reset token has been filled in below (a real app would email it).';
    } else {
      document.getElementById('reset-token').value = '';
      resetTokenHint.textContent = data.message || 'If that email is registered, check it for a reset token.';
    }
    showToast(data.message || 'Reset token requested.', 'success');
  } catch {
    forgotError.textContent = 'Network error while requesting reset.';
  }
});

resetPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetError.textContent = '';
  const token = document.getElementById('reset-token').value.trim();
  const password = document.getElementById('reset-password').value;

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      resetError.textContent = data.error || 'Failed to reset password.';
      return;
    }
    showToast(data.message || 'Password updated.', 'success');
    resetPasswordForm.reset();
    forgotForm.reset();
    showAuthStep('login');
  } catch {
    resetError.textContent = 'Network error while resetting password.';
  }
});

function showApp(user) {
  authView.hidden = true;
  appView.hidden = false;
  appTabs.hidden = false;
  userBox.hidden = false;
  currentUsernameEl.textContent = `${user.firstName} ${user.lastName}`;
  refreshAll();
  loadSettings();
}

function showAuth() {
  authView.hidden = false;
  appView.hidden = true;
  appTabs.hidden = true;
  userBox.hidden = true;
  showAuthStep('login');
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      loginError.textContent = data.error || 'Login failed.';
      return;
    }
    showToast(`Welcome back, ${data.firstName}!`, 'success');
    loginForm.reset();
    showApp(data);
  } catch {
    loginError.textContent = 'Network error while logging in.';
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  const firstName = document.getElementById('register-first-name').value.trim();
  const lastName = document.getElementById('register-last-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      registerError.textContent = data.error || 'Registration failed.';
      return;
    }
    showToast(data.message || 'Sign up successful. Please log in.', 'success');
    registerForm.reset();
    showAuthStep('login');
  } catch {
    registerError.textContent = 'Network error while registering.';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    showToast('Logged out.', 'success');
    showAuth();
  }
});

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      showApp(data);
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

checkSession();
