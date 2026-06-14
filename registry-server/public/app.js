// Client Application Logic for Symbiosis (sbio.cloud) Dashboard

const API_BASE = ''; // Served from same origin
let currentUser = null;
let token = localStorage.getItem('sbio_auth_token');
let myAgents = [];
let selectedAgent = null;
let currentSelectedSchemaTab = 'in';
let currentModalSchemaTab = 'in';
let modalAgent = null;

// Telemetry state
let isLogsPaused = false;
let logsInterval = null;
let statsInterval = null;
let knownLogIds = new Set();

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  checkAuth();
  loadStats();
  loadCatalog();
  
  // Set up polling
  statsInterval = setInterval(loadStats, 5000);
  
  // Set up telemetry polling if tab active
  startLogsPolling();
}

// ---------------- AUTHENTICATION HANDLERS ----------------

function checkAuth() {
  const loggedOutDiv = document.getElementById('user-logged-out');
  const loggedInDiv = document.getElementById('user-logged-in');
  const headerUsername = document.getElementById('header-username');

  if (token) {
    // Attempt to verify token
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (!res.ok) throw new Error('Token expired');
      return res.json();
    })
    .then(data => {
      currentUser = data.user;
      loggedOutDiv.classList.add('hidden');
      loggedInDiv.classList.remove('hidden');
      headerUsername.textContent = currentUser.name || currentUser.email;
      
      // Setup dev workspace
      document.getElementById('auth-panel').classList.add('hidden');
      document.getElementById('console-panel').classList.remove('hidden');
      loadMyAgents();
    })
    .catch(err => {
      console.warn('Auth check failed:', err.message);
      logout();
    });
  } else {
    loggedOutDiv.classList.remove('hidden');
    loggedInDiv.classList.add('hidden');
    document.getElementById('auth-panel').classList.remove('hidden');
    document.getElementById('console-panel').classList.add('hidden');
  }
}

function toggleAuthTab(tab) {
  const signinBtn = document.getElementById('tab-signin-btn');
  const signupBtn = document.getElementById('tab-signup-btn');
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');

  if (tab === 'signin') {
    signinBtn.classList.add('active');
    signupBtn.classList.remove('active');
    signinForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
  } else {
    signinBtn.classList.remove('active');
    signupBtn.classList.add('active');
    signinForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
  }
}

async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('signin-email').value;
  const password = document.getElementById('signin-password').value;
  const errorDiv = document.getElementById('signin-error');
  errorDiv.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'Login failed.');

    token = data.token;
    localStorage.setItem('sbio_auth_token', token);
    initApp();
  } catch (error) {
    errorDiv.textContent = error.message;
  }
}

async function handleSignUp(e) {
  e.preventDefault();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const errorDiv = document.getElementById('signup-error');
  errorDiv.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'Signup failed.');

    token = data.token;
    localStorage.setItem('sbio_auth_token', token);
    initApp();
  } catch (error) {
    errorDiv.textContent = error.message;
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('sbio_auth_token');
  checkAuth();
}

// ---------------- STATS HANDLER ----------------

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await res.json();
    if (res.ok) {
      document.getElementById('stat-agents').textContent = data.total_agents;
      document.getElementById('stat-active').textContent = data.active_agents_1h;
      document.getElementById('stat-logs').textContent = data.total_logs;
      document.getElementById('stat-devs').textContent = data.total_developers;
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// ---------------- CATALOG NAVIGATION & FILTERING ----------------

async function loadCatalog() {
  const grid = document.getElementById('catalog-grid');
  try {
    const res = await fetch(`${API_BASE}/api/agents`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load catalog');

    renderCatalogGrid(data.agents);
    populateSkillFilter(data.agents);
  } catch (error) {
    grid.innerHTML = `<div class="form-error">Failed to fetch agent registry: ${error.message}</div>`;
  }
}

function renderCatalogGrid(agents) {
  const grid = document.getElementById('catalog-grid');
  if (agents.length === 0) {
    grid.innerHTML = `<p class="empty-state-text" style="grid-column: 1/-1; text-align: center;">No agents found matching requirements.</p>`;
    return;
  }

  grid.innerHTML = agents.map(agent => {
    const skillsHtml = agent.skills.map(s => `<span class="tag skill-tag">${s}</span>`).join('');
    const tagsHtml = agent.tags.map(t => `<span class="tag">${t}</span>`).join('');
    
    return `
      <div class="agent-card" onclick="openAgentModal('${agent.id}')">
        <div class="card-top">
          <div class="card-header-row">
            <h3 class="agent-title">${escapeHTML(agent.name)}</h3>
            <span class="agent-status-badge">Active</span>
          </div>
          <span class="agent-id-str">${escapeHTML(agent.id)}</span>
          <p class="agent-desc">${escapeHTML(agent.description || 'No description provided.')}</p>
        </div>
        <div class="card-bottom">
          <div class="tags-container">
            ${skillsHtml}
            ${tagsHtml}
          </div>
          <button class="btn btn-secondary btn-small btn-block">
            <i class="fa-solid fa-code"></i> View Protocol Schemas
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function populateSkillFilter(agents) {
  const skillSelect = document.getElementById('filter-skill');
  const allSkills = new Set();
  agents.forEach(agent => {
    if (agent.skills) agent.skills.forEach(s => allSkills.add(s));
  });

  // Keep first option "All Skills"
  skillSelect.innerHTML = '<option value="">All Skills</option>';
  allSkills.forEach(skill => {
    const opt = document.createElement('option');
    opt.value = skill;
    opt.textContent = skill;
    skillSelect.appendChild(opt);
  });
}

async function handleSearch() {
  const q = document.getElementById('catalog-search').value;
  const skill = document.getElementById('filter-skill').value;
  const grid = document.getElementById('catalog-grid');
  
  // Show spinner
  grid.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Filtering agent network...</p>
    </div>
  `;

  try {
    const url = new URL(`${window.location.origin}/api/agents`);
    if (q) url.searchParams.append('q', q);
    if (skill) url.searchParams.append('skill', skill);

    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    renderCatalogGrid(data.agents);
  } catch (error) {
    grid.innerHTML = `<div class="form-error">${error.message}</div>`;
  }
}

// ---------------- TELEMETRY LOGS FEED ----------------

function startLogsPolling() {
  if (logsInterval) clearInterval(logsInterval);
  
  // Initial load
  loadLogs();
  
  // Poll every 3 seconds
  logsInterval = setInterval(() => {
    if (!isLogsPaused) {
      loadLogs();
    }
  }, 3000);
}

async function loadLogs() {
  try {
    const res = await fetch(`${API_BASE}/api/logs?limit=50`);
    const data = await res.json();
    if (res.ok) {
      renderLogsConsole(data.logs);
    }
  } catch (error) {
    console.error('Error loading logs:', error);
  }
}

function renderLogsConsole(logs) {
  const consoleEl = document.getElementById('logs-console');
  
  // Reverse logs to render chronological order (oldest to newest)
  const sortedLogs = [...logs].reverse();
  
  let newLogsAdded = false;

  sortedLogs.forEach(log => {
    if (knownLogIds.has(log.id)) return;
    
    knownLogIds.add(log.id);
    newLogsAdded = true;

    const line = document.createElement('div');
    line.className = `terminal-line ${log.type}`;

    const timeStr = new Date(log.timestamp).toLocaleTimeString();
    const timeSpan = `<span class="log-time">[${timeStr}]</span>`;

    let prefix = `[${log.agent_name}]`;
    if (log.type === 'call') {
      prefix = `[${log.caller_name || 'unknown'} ➔ ${log.agent_name}]`;
    }

    line.innerHTML = `${timeSpan} <strong>${escapeHTML(prefix)}</strong> ${escapeHTML(log.message)}`;
    
    // Add raw payload if present and not empty
    if (log.payload && Object.keys(log.payload).length > 0) {
      const payloadPre = document.createElement('pre');
      payloadPre.style.fontSize = '11px';
      payloadPre.style.color = '#38bdf8';
      payloadPre.style.margin = '4px 0 0 16px';
      payloadPre.textContent = JSON.stringify(log.payload, null, 2);
      line.appendChild(payloadPre);
    }

    consoleEl.appendChild(line);
  });

  // Limit DOM element count to prevent bloating (DOM Pruning)
  const maxLines = 100;
  while (consoleEl.children.length > maxLines) {
    consoleEl.removeChild(consoleEl.firstChild);
  }

  // Scroll to bottom if new lines were added
  if (newLogsAdded) {
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

function toggleLogsPause() {
  isLogsPaused = !isLogsPaused;
  const btn = document.getElementById('pause-logs-btn');
  const indicator = document.getElementById('live-indicator');
  
  if (isLogsPaused) {
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Resume Feed';
    indicator.innerHTML = '<span class="pulse-dot" style="background-color: var(--neon-amber); box-shadow: 0 0 8px var(--neon-amber);"></span> PAUSED';
    indicator.style.color = 'var(--neon-amber)';
  } else {
    btn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause Feed';
    indicator.innerHTML = '<span class="pulse-dot"></span> LIVE';
    indicator.style.color = 'var(--neon-emerald)';
    loadLogs();
  }
}

function clearLogsConsole() {
  document.getElementById('logs-console').innerHTML = '';
  knownLogIds.clear();
}

// ---------------- DEVELOPER WORKSPACE LOGIC ----------------

async function loadMyAgents() {
  const listEl = document.getElementById('my-agents-list');
  try {
    const res = await fetch(`${API_BASE}/api/agents`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Filter agents owned by current user
    myAgents = data.agents.filter(a => a.user_id === currentUser.id);

    if (myAgents.length === 0) {
      listEl.innerHTML = `<p class="empty-state-text">You haven't registered any agents yet.</p>`;
      return;
    }

    listEl.innerHTML = myAgents.map(agent => `
      <div class="my-agent-item ${selectedAgent && selectedAgent.id === agent.id ? 'active' : ''}" onclick="selectAgent('${agent.id}')">
        <span class="my-agent-name">${escapeHTML(agent.name)}</span>
        <span class="my-agent-id">${escapeHTML(agent.id)}</span>
      </div>
    `).join('');
  } catch (error) {
    listEl.innerHTML = `<div class="form-error">${error.message}</div>`;
  }
}

function selectAgent(agentId) {
  selectedAgent = myAgents.find(a => a.id === agentId);
  if (!selectedAgent) return;

  // Render selection state in list
  document.querySelectorAll('.my-agent-item').forEach(el => {
    el.classList.remove('active');
    if (el.querySelector('.my-agent-id').textContent === agentId) {
      el.classList.add('active');
    }
  });

  // Show Workspace Details Pane
  document.getElementById('workspace-empty').classList.add('hidden');
  document.getElementById('workspace-register').classList.add('hidden');
  
  const detailsPane = document.getElementById('workspace-details');
  detailsPane.classList.remove('hidden');

  // Populate workspace variables
  document.getElementById('view-agent-name').textContent = selectedAgent.name;
  document.getElementById('view-agent-id').textContent = selectedAgent.id;
  document.getElementById('view-agent-endpoint').textContent = selectedAgent.endpoint;

  // Mask agent token initially
  const tokenInput = document.getElementById('agent-token-input');
  tokenInput.value = '••••••••••••••••••••••••';
  tokenInput.type = 'password';
  document.getElementById('token-reveal-btn').innerHTML = '<i class="fa-solid fa-eye"></i>';
  document.getElementById('new-token-warn').classList.add('hidden');

  // Skills
  const skillsContainer = document.getElementById('view-agent-skills');
  skillsContainer.innerHTML = selectedAgent.skills.length > 0 
    ? selectedAgent.skills.map(s => `<span class="tag skill-tag">${s}</span>`).join('')
    : '<span class="tag">None</span>';

  // Tags
  const tagsContainer = document.getElementById('view-agent-tags');
  tagsContainer.innerHTML = selectedAgent.tags.length > 0 
    ? selectedAgent.tags.map(t => `<span class="tag">${t}</span>`).join('')
    : '<span class="tag">None</span>';

  // Schemas
  currentSelectedSchemaTab = 'in';
  renderSelectedSchema();

  // Delete button trigger setup
  const deleteBtn = document.getElementById('delete-agent-btn');
  deleteBtn.onclick = () => handleDeleteAgent(selectedAgent.id);
}

function renderSelectedSchema() {
  const codeEl = document.getElementById('view-agent-schema');
  const schema = currentSelectedSchemaTab === 'in' 
    ? selectedAgent.schema_in 
    : selectedAgent.schema_out;
  
  codeEl.textContent = JSON.stringify(schema, null, 2);
}

function switchSchemaTab(type) {
  currentSelectedSchemaTab = type;
  const tabs = document.querySelectorAll('.schema-tabs-wrapper .schema-tab');
  tabs[0].classList.toggle('active', type === 'in');
  tabs[1].classList.toggle('active', type === 'out');
  renderSelectedSchema();
}

// Token visibility controls
function toggleTokenVisibility() {
  const tokenInput = document.getElementById('agent-token-input');
  const revealBtn = document.getElementById('token-reveal-btn');
  
  if (tokenInput.type === 'password') {
    tokenInput.type = 'text';
    revealBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
  } else {
    tokenInput.type = 'password';
    revealBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
  }
}

function copyAgentToken() {
  const tokenInput = document.getElementById('agent-token-input');
  if (tokenInput.value.includes('•')) {
    alert('Please reveal the token first to copy it.');
    return;
  }
  
  navigator.clipboard.writeText(tokenInput.value).then(() => {
    const copyBtn = document.getElementById('token-copy-btn');
    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
    }, 2000);
  });
}

// Forms display
function showRegisterForm() {
  document.getElementById('workspace-empty').classList.add('hidden');
  document.getElementById('workspace-details').classList.add('hidden');
  document.getElementById('workspace-register').classList.remove('hidden');
  
  // Clear form
  document.getElementById('register-agent-form').reset();
  document.getElementById('agent-reg-error').textContent = '';
}

function hideRegisterForm() {
  document.getElementById('workspace-register').classList.add('hidden');
  if (selectedAgent) {
    document.getElementById('workspace-details').classList.remove('hidden');
  } else {
    document.getElementById('workspace-empty').classList.remove('hidden');
  }
}

async function handleAgentRegistration(e) {
  e.preventDefault();
  const errorDiv = document.getElementById('agent-reg-error');
  errorDiv.textContent = '';

  const id = document.getElementById('agent-reg-id').value.trim();
  const name = document.getElementById('agent-reg-name').value.trim();
  const endpoint = document.getElementById('agent-reg-endpoint').value.trim();
  const description = document.getElementById('agent-reg-desc').value.trim();
  
  // Format arrays
  const skills = document.getElementById('agent-reg-skills').value.split(',')
    .map(s => s.trim()).filter(s => s.length > 0);
  const tags = document.getElementById('agent-reg-tags').value.split(',')
    .map(t => t.trim()).filter(t => t.length > 0);

  // Validate JSON schema inputs
  let schema_in = {};
  let schema_out = {};
  const schemaInStr = document.getElementById('agent-reg-schema-in').value.trim();
  const schemaOutStr = document.getElementById('agent-reg-schema-out').value.trim();

  try {
    if (schemaInStr) schema_in = JSON.parse(schemaInStr);
  } catch (err) {
    errorDiv.textContent = 'Invalid JSON in Input Schema.';
    return;
  }

  try {
    if (schemaOutStr) schema_out = JSON.parse(schemaOutStr);
  } catch (err) {
    errorDiv.textContent = 'Invalid JSON in Output Schema.';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id, name, description, endpoint, skills, tags, schema_in, schema_out })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save agent.');

    // Save success - refresh agent list
    await loadMyAgents();
    await loadCatalog();

    // Select the newly registered agent
    selectedAgent = myAgents.find(a => a.id === id) || data.agent;
    selectAgent(id);

    // If a new token was returned, show it!
    if (data.token) {
      const tokenInput = document.getElementById('agent-token-input');
      tokenInput.value = data.token;
      tokenInput.type = 'text'; // Reveal immediately
      document.getElementById('new-token-warn').classList.remove('hidden');
      document.getElementById('token-reveal-btn').innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    }
  } catch (error) {
    errorDiv.textContent = error.message;
  }
}

async function handleDeleteAgent(agentId) {
  if (!confirm(`Are you sure you want to permanently delete agent "${agentId}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Reset workspace
    selectedAgent = null;
    document.getElementById('workspace-details').classList.add('hidden');
    document.getElementById('workspace-empty').classList.remove('hidden');

    await loadMyAgents();
    await loadCatalog();
  } catch (error) {
    alert(`Failed to delete agent: ${error.message}`);
  }
}

// ---------------- TAB CONTROL ----------------

function switchTab(tabName) {
  // Toggle Active Panes
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // Toggle Active Nav Buttons
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  
  const activeBtn = document.getElementById(`nav-${tabName}-btn`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Toggle 'Launch App' and main navigation links based on active tab
  const launchBtn = document.getElementById('nav-launch-btn');
  const navLinks = document.querySelector('.nav-links');
  
  if (tabName === 'landing') {
    if (launchBtn) launchBtn.classList.remove('hidden');
    if (navLinks) navLinks.classList.add('hidden');
  } else {
    if (launchBtn) launchBtn.classList.add('hidden');
    if (navLinks) navLinks.classList.remove('hidden');
  }
  
  if (tabName === 'catalog') {
    loadCatalog();
  }
}

// Handles the smart redirection when Launch App is clicked
function launchApp() {
  if (token) {
    switchTab('catalog'); // Take to Agent Market dashboard
  } else {
    switchTab('console'); // Redirect to Sign In / Sign Up portal
  }
}

// ---------------- CATALOG DETAILED MODAL ----------------

async function openAgentModal(agentId) {
  const modal = document.getElementById('agent-modal');
  
  try {
    const res = await fetch(`${API_BASE}/api/agents/${agentId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    modalAgent = data.agent;
    
    // Fill values
    document.getElementById('modal-agent-name').textContent = modalAgent.name;
    document.getElementById('modal-agent-id').textContent = modalAgent.id;
    
    const ep = document.getElementById('modal-agent-endpoint');
    ep.href = modalAgent.endpoint;
    ep.textContent = modalAgent.endpoint;
    
    document.getElementById('modal-agent-desc').textContent = modalAgent.description || 'No description provided.';
    
    // Skills + Tags combined in modal
    const tagsContainer = document.getElementById('modal-agent-tags');
    const skillsHtml = modalAgent.skills.map(s => `<span class="tag skill-tag">${s}</span>`).join('');
    const tagsHtml = modalAgent.tags.map(t => `<span class="tag">${t}</span>`).join('');
    tagsContainer.innerHTML = skillsHtml + tagsHtml || '<span class="tag">None</span>';

    currentModalSchemaTab = 'in';
    renderModalSchema();

    // Show modal
    modal.classList.add('show');
  } catch (error) {
    alert(`Failed to fetch agent details: ${error.message}`);
  }
}

function renderModalSchema() {
  const codeEl = document.getElementById('modal-agent-schema');
  const schema = currentModalSchemaTab === 'in' 
    ? modalAgent.schema_in 
    : modalAgent.schema_out;
  
  codeEl.textContent = JSON.stringify(schema, null, 2);
  
  document.getElementById('modal-tab-in').classList.toggle('active', currentModalSchemaTab === 'in');
  document.getElementById('modal-tab-out').classList.toggle('active', currentModalSchemaTab === 'out');
}

function switchModalSchema(type) {
  currentModalSchemaTab = type;
  renderModalSchema();
}

function closeAgentModal() {
  document.getElementById('agent-modal').classList.remove('show');
}

// Close modal if clicked outside
window.onclick = function(event) {
  const modal = document.getElementById('agent-modal');
  if (event.target === modal) {
    closeAgentModal();
  }
}

// ---------------- HELPERS ----------------

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
