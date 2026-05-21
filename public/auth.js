const SESSION_KEY = "ruunnnnnnn_session";

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (error) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function showMessage(message, type = "info") {
  const element = document.getElementById("auth-message");
  if (!element) {
    return;
  }
  element.textContent = message;
  element.dataset.type = type;
  element.hidden = false;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return password.length >= 8;
}

async function submitAuth(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

function wireSignupForm() {
  const form = document.getElementById("signup-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    const button = form.querySelector("button[type='submit']");

    if (username.length < 3) {
      showMessage("Username must be at least 3 characters.", "error");
      return;
    }
    if (!validateEmail(email)) {
      showMessage("Enter a valid email address.", "error");
      return;
    }
    if (!validatePassword(password)) {
      showMessage("Password must be at least 8 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      showMessage("Passwords do not match.", "error");
      return;
    }

    button.disabled = true;
    showMessage("Creating your account...", "info");
    try {
      const result = await submitAuth("/api/signup", { username, email, password });
      setSession(result.session);
      window.location.href = "index.html";
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
}

function wireLoginForm() {
  const form = document.getElementById("login-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const identifier = String(formData.get("identifier") || "").trim();
    const password = String(formData.get("password") || "");
    const button = form.querySelector("button[type='submit']");

    if (!identifier || !password) {
      showMessage("Enter your username/email and password.", "error");
      return;
    }

    button.disabled = true;
    showMessage("Logging you in...", "info");
    try {
      const result = await submitAuth("/api/login", { identifier, password });
      setSession(result.session);
      window.location.href = "index.html";
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
}

const existingSession = getSession();
if (existingSession && location.pathname.endsWith("login.html")) {
  window.location.href = "index.html";
}

wireSignupForm();
wireLoginForm();
