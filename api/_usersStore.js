const crypto = require("crypto");
const XLSX = require("xlsx");

const HEADERS = ["username", "email", "password", "signup date/time"];
const HASH_ITERATIONS = 210000;
const HASH_LENGTH = 32;
const HASH_DIGEST = "sha256";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function githubConfig() {
  return {
    owner: requiredEnv("GITHUB_OWNER"),
    repo: requiredEnv("GITHUB_REPO"),
    branch: process.env.GITHUB_BRANCH || "main",
    path: process.env.USERS_XLSX_PATH || "users.xlsx",
    token: requiredEnv("GITHUB_TOKEN"),
  };
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function githubRequest(url, options = {}) {
  const config = githubConfig();
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `GitHub API request failed: ${response.status}`);
  }
  return data;
}

function workbookFromRows(rows) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
  XLSX.utils.book_append_sheet(workbook, worksheet, "users");
  return workbook;
}

function rowsFromWorkbook(buffer) {
  if (!buffer || !buffer.length) {
    return [];
  }
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet, { defval: "" });
}

async function loadUsersWorkbook() {
  const config = githubConfig();
  const encodedPath = config.path.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`;
  const file = await githubRequest(url);

  if (!file) {
    return { rows: [], sha: null };
  }

  const content = String(file.content || "").replace(/\n/g, "");
  return {
    rows: rowsFromWorkbook(Buffer.from(content, "base64")),
    sha: file.sha,
  };
}

async function saveUsersWorkbook(rows, sha) {
  const config = githubConfig();
  const encodedPath = config.path.split("/").map(encodeURIComponent).join("/");
  const workbook = workbookFromRows(rows);
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  const body = {
    message: "Update users.xlsx",
    content: buffer.toString("base64"),
    branch: config.branch,
  };

  if (sha) {
    body.sha = sha;
  }

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}`;
  await githubRequest(url, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function normalizeUser(row) {
  return {
    username: String(row.username || "").trim(),
    email: String(row.email || "").trim().toLowerCase(),
    password: String(row.password || ""),
    signupDateTime: String(row["signup date/time"] || ""),
  };
}

function validateSignup({ username, email, password }) {
  if (!username || username.trim().length < 3) {
    return "Username must be at least 3 characters.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) {
    return "Enter a valid email address.";
  }
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_LENGTH, HASH_DIGEST).toString("hex");
  return `pbkdf2$${HASH_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, iterations, salt, expectedHash] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !expectedHash) {
    return false;
  }
  const actualHash = crypto
    .pbkdf2Sync(password, salt, Number(iterations), Buffer.from(expectedHash, "hex").length, HASH_DIGEST)
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function createSession(user) {
  const secret = requiredEnv("AUTH_SESSION_SECRET");
  const payload = {
    username: user.username,
    email: user.email,
    issuedAt: new Date().toISOString(),
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");
  return {
    user: payload,
    token: `${payloadBase64}.${signature}`,
  };
}

module.exports = {
  createSession,
  hashPassword,
  json,
  loadUsersWorkbook,
  normalizeUser,
  readRequestBody,
  saveUsersWorkbook,
  validateSignup,
  verifyPassword,
};
