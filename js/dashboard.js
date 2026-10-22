/**
 * SIS MONITOREO — Dashboard Logic
 * Direct Coolify API Integration, Server Management by IP & Real-time Services Monitoring
 */

// Configuration Defaults
const DEFAULT_CONFIG = {
  apiUrl: 'https://monitoreosrv.elalto.gob.bo',
  apiToken: '1|gEuZ0WRydBBBuyI3u7aYfQpDi4omRn9g8jWJjtx2a48a1784',
  refreshInterval: 30, // seconds
};

// State Store
const state = {
  config: { ...DEFAULT_CONFIG },
  servers: [],
  services: [],
  sshKeys: [],
  selectedServer: 'all',
  typeFilter: 'all',
  searchQuery: '',
  isOnline: false,
  latency: 0,
  refreshTimer: null,
  activePublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIIIie7EVIXix1uny2ltEIuTvFZTCz17aT61+4QWa6/a coolify-host'
};

// Load Saved Config from LocalStorage
function loadConfig() {
  try {
    const saved = localStorage.getItem('sis_monitoreo_config');
    if (saved) {
      state.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error loading config from localStorage', e);
  }
}

function saveConfig(newConfig) {
  state.config = { ...state.config, ...newConfig };
  localStorage.setItem('sis_monitoreo_config', JSON.stringify(state.config));
}

// Coolify API Client
class CoolifyAPI {
  static getHeaders() {
    return {
      'Authorization': `Bearer ${state.config.apiToken.trim()}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  static getBaseUrl() {
    let url = state.config.apiUrl.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  static async request(endpoint, options = {}) {
    const url = `${this.getBaseUrl()}/api/v1${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const startTime = performance.now();
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...(options.headers || {})
        }
      });

      state.latency = Math.round(performance.now() - startTime);

      if (!response.ok) {
        let errData = {};
        try { errData = await response.json(); } catch (_) {}
        const msg = errData.message || errData.error || `Error HTTP ${response.status}: ${response.statusText}`;
        throw new Error(msg);
      }

      const data = await response.json();
      state.isOnline = true;
      return data;
    } catch (err) {
      state.latency = Math.round(performance.now() - startTime);
      state.isOnline = false;
      throw err;
    }
  }

  static async getServers() {
    return await this.request('/servers');
  }

  static async getServer(uuid) {
    return await this.request(`/servers/${uuid}`);
  }

  static async getServerResources(uuid) {
    return await this.request(`/servers/${uuid}/resources`);
  }

  static async getApplications() {
    return await this.request('/applications');
  }

  static async getDatabases() {
    return await this.request('/databases');
  }

  static async getServices() {
    return await this.request('/services');
  }

  static async getSecurityKeys() {
    return await this.request('/security/keys');
  }

  static async createServer(payload) {
    return await this.request('/servers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  static async validateServer(uuid) {
    return await this.request(`/servers/${uuid}/validate`, {
      method: 'POST'
    });
  }

  static async deleteServer(uuid) {
    return await this.request(`/servers/${uuid}`, {
      method: 'DELETE'
    });
  }

  static async restartApplication(uuid) {
    return await this.request(`/applications/${uuid}/restart`, {
      method: 'POST'
    });
  }
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`;
  } else {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  }

  toast.innerHTML = `
    <span class="toast-icon">${iconSvg}</span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Clipboard copy helper
function copyToClipboard(text, successMsg = 'Copiado al portapapeles') {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast(successMsg, 'success'));
  } else {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast(successMsg, 'success');
  }
}

// Data Fetching & Syncing
async function syncDashboardData() {
  const refreshBtn = document.getElementById('btnRefresh');
  if (refreshBtn) refreshBtn.classList.add('spinning');

  try {
    // 1. Fetch servers, apps, dbs, services, keys in parallel
    const [serversData, appsData, dbsData, servicesData, keysData] = await Promise.all([
      CoolifyAPI.getServers().catch(err => { console.warn('Servers error:', err); return []; }),
      CoolifyAPI.getApplications().catch(err => { console.warn('Apps error:', err); return []; }),
      CoolifyAPI.getDatabases().catch(err => { console.warn('Dbs error:', err); return []; }),
      CoolifyAPI.getServices().catch(err => { console.warn('Services error:', err); return []; }),
      CoolifyAPI.getSecurityKeys().catch(err => { console.warn('Keys error:', err); return []; })
    ]);

    state.servers = Array.isArray(serversData) ? serversData : [];
    state.sshKeys = Array.isArray(keysData) ? keysData : [];

    // Save active public key if found
    if (state.sshKeys.length > 0 && state.sshKeys[0].public_key) {
      state.activePublicKey = state.sshKeys[0].public_key.trim();
    }

    // 2. Normalize and Combine Services
    const normalizedServices = [];

    // Normalize applications
    if (Array.isArray(appsData)) {
      appsData.forEach(app => {
        const serverUuid = app.destination?.server?.uuid || app.destination?.server_id || 'localhost';
        const serverName = app.destination?.server?.name || 'localhost';
        const serverIp = app.destination?.server?.ip || 'host.docker.internal';

        normalizedServices.push({
          id: app.uuid || app.id,
          uuid: app.uuid,
          name: app.name || 'Aplicación',
          type: 'application',
          typeName: 'Aplicación Web',
          serverUuid: serverUuid,
          serverName: serverName,
          serverIp: serverIp,
          stack: app.static_image || app.build_pack || 'Docker / Nginx',
          gitRepo: app.git_repository || null,
          fqdn: app.fqdn || null,
          status: app.status || 'running',
          updatedAt: app.updated_at || app.created_at,
          ports: app.ports_exposes || '80/443',
          raw: app
        });
      });
    }

    // Normalize databases
    if (Array.isArray(dbsData)) {
      dbsData.forEach(db => {
        const serverUuid = db.destination?.server?.uuid || 'localhost';
        const serverName = db.destination?.server?.name || 'localhost';
        const serverIp = db.destination?.server?.ip || 'host.docker.internal';

        normalizedServices.push({
          id: db.uuid || db.id,
          uuid: db.uuid,
          name: db.name || 'Base de Datos',
          type: 'database',
          typeName: 'Base de Datos',
          serverUuid: serverUuid,
          serverName: serverName,
          serverIp: serverIp,
          stack: db.image || db.type || 'PostgreSQL / MySQL / Redis',
          gitRepo: null,
          fqdn: db.public_port ? `${serverIp}:${db.public_port}` : null,
          status: db.status || 'running',
          updatedAt: db.updated_at || db.created_at,
          ports: db.public_port || 'Interno',
          raw: db
        });
      });
    }

    // Normalize complex services
    if (Array.isArray(servicesData)) {
      servicesData.forEach(svc => {
        const serverUuid = svc.server?.uuid || 'localhost';
        const serverName = svc.server?.name || 'localhost';
        const serverIp = svc.server?.ip || 'host.docker.internal';

        normalizedServices.push({
          id: svc.uuid || svc.id,
          uuid: svc.uuid,
          name: svc.name || 'Servicio Docker',
          type: 'service',
          typeName: 'Servicio Compuesto',
          serverUuid: serverUuid,
          serverName: serverName,
          serverIp: serverIp,
          stack: svc.service_type || 'Docker Compose Stack',
          gitRepo: null,
          fqdn: svc.fqdn || null,
          status: svc.status || 'running',
          updatedAt: svc.updated_at || svc.created_at,
          ports: 'Multiple',
          raw: svc
        });
      });
    }

    // Add Traefik Proxy for localhost or servers running Traefik
    state.servers.forEach(srv => {
      if (srv.proxy && srv.proxy.status === 'running') {
        normalizedServices.push({
          id: `proxy-${srv.uuid}`,
          uuid: null,
          name: `Traefik Reverse Proxy (${srv.name})`,
          type: 'proxy',
          typeName: 'Reverse Proxy & SSL',
          serverUuid: srv.uuid,
          serverName: srv.name,
          serverIp: srv.ip,
          stack: `Traefik ${srv.detected_traefik_version || 'v3.7'}`,
          gitRepo: null,
          fqdn: `http://${srv.ip}:8080`,
          status: 'running',
          updatedAt: srv.updated_at,
          ports: '80, 443, 8080',
          raw: srv.proxy
        });
      }
    });

    state.services = normalizedServices;
    updateUI();
  } catch (err) {
    console.error('Sync failed:', err);
    state.isOnline = false;
    updateUI();
    showToast(`Error al sincronizar con Coolify: ${err.message}`, 'error');
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }
}

// UI Update Master
function updateUI() {
  updateApiStatus();
  renderMetrics();
  renderServerCards();
  renderServicesFilter();
  renderServicesTable();
  populateKeySelect();
}

// 1. Api Status Pill
function updateApiStatus() {
  const dot = document.getElementById('apiStatusDot');
  const text = document.getElementById('apiStatusText');
  const latencyBadge = document.getElementById('apiLatencyBadge');

  if (!dot || !text) return;

  if (state.isOnline) {
    dot.className = 'status-dot online';
    text.textContent = 'Coolify API Conectado';
    if (latencyBadge) {
      latencyBadge.textContent = `${state.latency} ms`;
      latencyBadge.style.display = 'inline-block';
    }
  } else {
    dot.className = 'status-dot';
    text.textContent = 'Desconectado / Error';
    if (latencyBadge) latencyBadge.style.display = 'none';
  }
}

// 2. Metrics Row
function renderMetrics() {
  const totalServers = state.servers.length;
  const onlineServers = state.servers.filter(s => s.is_reachable).length;
  const totalServices = state.services.length;
  const onlineServices = state.services.filter(s => s.status.includes('running') || s.status.includes('healthy') || s.status === 'running:unknown').length;

  document.getElementById('metricServersVal').textContent = `${onlineServers}/${totalServers}`;
  document.getElementById('metricServersSub').textContent = `${totalServers} Servidores configurados`;

  document.getElementById('metricServicesVal').textContent = `${onlineServices}/${totalServices}`;
  document.getElementById('metricServicesSub').textContent = `${onlineServices} Operativos en vivo`;

  document.getElementById('metricLatencyVal').textContent = `${state.latency} ms`;
  document.getElementById('metricLatencySub').textContent = state.isOnline ? 'Conexión estable' : 'Sin respuesta';

  const sentinelServers = state.servers.filter(s => s.settings?.is_sentinel_enabled).length;
  document.getElementById('metricSentinelVal').textContent = `${sentinelServers}/${totalServers}`;
  document.getElementById('metricSentinelSub').textContent = 'Agente métricas activo';
}

// 3. Render Server Cards
function renderServerCards() {
  const container = document.getElementById('serversGrid');
  const counter = document.getElementById('serversCount');
  if (!container) return;

  if (counter) counter.textContent = `${state.servers.length} Servidores`;

  container.innerHTML = '';

  state.servers.forEach(server => {
    const isOnline = server.is_reachable;
    const isSelected = state.selectedServer === server.uuid;
    const serverServices = state.services.filter(s => s.serverUuid === server.uuid);
    const sentinelEnabled = server.settings?.is_sentinel_enabled ?? true;

    const card = document.createElement('div');
    card.className = `server-card ${isSelected ? 'active-selected' : ''}`;
    card.dataset.uuid = server.uuid;

    card.innerHTML = `
      <div class="server-card-top">
        <div class="server-info">
          <div class="server-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/>
              <line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
          </div>
          <div class="server-title-group">
            <h3>
              ${escapeHtml(server.name)}
              ${server.is_coolify_host ? '<span class="dash-brand-badge" style="font-size:0.65rem;">Host Principal</span>' : ''}
            </h3>
            <div class="server-desc">${escapeHtml(server.description || 'Servidor gestionado por Coolify')}</div>
          </div>
        </div>

        <div class="status-badge ${isOnline ? 'online' : 'offline'}">
          <span class="status-dot ${isOnline ? 'online' : ''}"></span>
          ${isOnline ? 'En línea' : 'Inaccesible'}
        </div>
      </div>

      <div class="server-ip-box" title="Clic para copiar dirección IP" onclick="copyToClipboard('${server.ip}', 'IP ${server.ip} copiada')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>${escapeHtml(server.ip)}</span>
        <span style="font-size:0.75rem; color:var(--text-dim);">:${server.port || 22}</span>
      </div>

      <div class="server-meta-grid">
        <div class="server-meta-item">
          <span class="meta-k">Servicios</span>
          <span class="meta-v" style="color:var(--primary); font-weight:700;">${serverServices.length} Activos</span>
        </div>
        <div class="server-meta-item">
          <span class="meta-k">Sentinel</span>
          <span class="meta-v">${sentinelEnabled ? '<span style="color:var(--online)">● Activo</span>' : '<span style="color:var(--text-dim)">○ Inactivo</span>'}</span>
        </div>
        <div class="server-meta-item">
          <span class="meta-k">Usuario SSH</span>
          <span class="meta-v">${escapeHtml(server.user || 'root')}</span>
        </div>
      </div>

      <div class="server-card-actions">
        <button class="btn btn-outline btn-sm" onclick="filterByServer('${server.uuid}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
          ${isSelected ? 'Viendo Servicios' : 'Ver Servicios'}
        </button>

        <div style="display:flex; gap:6px;">
          <button class="btn-icon" title="Instrucciones SSH / Agente para este servidor" onclick="openSshAgentModal('${server.uuid}', '${server.ip}', '${server.user || 'root'}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
          </button>

          <button class="btn-icon" title="Validar Conexión SSH del Servidor" onclick="validateServerConnection('${server.uuid}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </button>

          <a href="${state.config.apiUrl}/server/${server.uuid}" target="_blank" rel="noopener" class="btn-icon" title="Abrir en Panel de Coolify">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // Card para agregar servidor
  const addCard = document.createElement('div');
  addCard.className = 'add-server-card';
  addCard.onclick = openAddServerModal;
  addCard.innerHTML = `
    <div class="add-server-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </div>
    <h4>Agregar Servidor por IP</h4>
    <p>Conecta un nuevo servidor mediante su dirección IP y clave SSH para monitorear sus servicios.</p>
    <button class="btn btn-primary btn-sm">
      + Agregar Nuevo Servidor
    </button>
  `;
  container.appendChild(addCard);
}

// 4. Render Services Filter Buttons
function renderServicesFilter() {
  const container = document.getElementById('serverFilterSelect');
  if (!container) return;

  let optionsHtml = `<option value="all">Todos los Servidores (${state.servers.length})</option>`;
  state.servers.forEach(srv => {
    const srvServicesCount = state.services.filter(s => s.serverUuid === srv.uuid).length;
    optionsHtml += `<option value="${srv.uuid}" ${state.selectedServer === srv.uuid ? 'selected' : ''}>
      ${srv.name} (${srv.ip}) — ${srvServicesCount} servicios
    </option>`;
  });

  container.innerHTML = optionsHtml;
}

// 5. Render Services Table
function renderServicesTable() {
  const tbody = document.getElementById('servicesTableBody');
  const countEl = document.getElementById('servicesCount');
  if (!tbody) return;

  // Filter services
  let filtered = state.services.filter(svc => {
    // Server filter
    if (state.selectedServer !== 'all' && svc.serverUuid !== state.selectedServer) {
      return false;
    }
    // Type filter
    if (state.typeFilter !== 'all' && svc.type !== state.typeFilter) {
      return false;
    }
    // Search query
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      const matchName = svc.name.toLowerCase().includes(q);
      const matchServer = svc.serverName.toLowerCase().includes(q) || svc.serverIp.toLowerCase().includes(q);
      const matchFqdn = svc.fqdn && svc.fqdn.toLowerCase().includes(q);
      const matchStack = svc.stack && svc.stack.toLowerCase().includes(q);
      if (!matchName && !matchServer && !matchFqdn && !matchStack) return false;
    }
    return true;
  });

  if (countEl) countEl.textContent = `${filtered.length} Servicios`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div style="font-weight:700; font-size:1rem; color:var(--text);">No se encontraron servicios</div>
            <div style="font-size:0.85rem;">Prueba cambiando los filtros o selecciona otro servidor.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(svc => {
    const isOnline = svc.status.includes('running') || svc.status.includes('healthy') || svc.status === 'running:unknown';
    const statusText = isOnline ? 'En Ejecución' : (svc.status.includes('degraded') ? 'Degradado' : 'Detenido');
    const statusClass = isOnline ? 'online' : (svc.status.includes('degraded') ? 'degraded' : 'offline');

    let iconSvg = '';
    if (svc.type === 'database') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
    } else if (svc.type === 'proxy') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
    }

    return `
      <tr>
        <td>
          <div class="service-cell-main">
            <div class="service-type-icon ${svc.type}">
              ${iconSvg}
            </div>
            <div>
              <div class="service-name">${escapeHtml(svc.name)}</div>
              ${svc.gitRepo ? `<div class="service-repo">repo: ${escapeHtml(svc.gitRepo)}</div>` : `<div class="service-repo">${escapeHtml(svc.typeName)}</div>`}
            </div>
          </div>
        </td>

        <td>
          <div style="font-weight:600; font-size:0.88rem;">${escapeHtml(svc.serverName)}</div>
          <div style="font-family:'JetBrains Mono',monospace; font-size:0.78rem; color:#38bdf8;">${escapeHtml(svc.serverIp)}</div>
        </td>

        <td>
          <span style="font-family:'JetBrains Mono',monospace; font-size:0.82rem; background:rgba(255,255,255,0.04); padding:3px 8px; border-radius:4px; border:1px solid var(--border);">
            ${escapeHtml(svc.stack)}
          </span>
        </td>

        <td>
          ${svc.fqdn ? `
            <a href="${svc.fqdn.startsWith('http') ? svc.fqdn : 'http://' + svc.fqdn}" target="_blank" rel="noopener" class="link-pill" title="Abrir URL">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              <span>${escapeHtml(svc.fqdn.replace(/^https?:\/\//, ''))}</span>
            </a>
          ` : `<span style="color:var(--text-dim); font-size:0.8rem;">Puerto ${svc.ports}</span>`}
        </td>

        <td>
          <div class="status-badge ${statusClass}">
            <span class="status-dot ${statusClass}"></span>
            ${statusText}
          </div>
        </td>

        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            ${svc.uuid ? `
              <button class="btn-icon" title="Reiniciar Servicio" onclick="restartService('${svc.uuid}', '${escapeHtml(svc.name)}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
              </button>
              <a href="${state.config.apiUrl}/project" target="_blank" rel="noopener" class="btn-icon" title="Ver en Coolify">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 6. Populate Private Keys dropdown
function populateKeySelect() {
  const select = document.getElementById('serverPrivateKeySelect');
  if (!select) return;

  if (state.sshKeys.length === 0) {
    select.innerHTML = '<option value="">No hay claves SSH registradas</option>';
    return;
  }

  select.innerHTML = state.sshKeys.map(k => `
    <option value="${k.uuid}">${k.name || 'Clave SSH'} (${k.fingerprint ? k.fingerprint.slice(0, 16) + '...' : k.uuid})</option>
  `).join('');
}

// Filter Actions
function filterByServer(serverUuid) {
  if (state.selectedServer === serverUuid) {
    state.selectedServer = 'all';
  } else {
    state.selectedServer = serverUuid;
  }
  updateUI();
  
  // Smooth scroll to services table
  const section = document.getElementById('servicesSection');
  if (section) section.scrollIntoView({ behavior: 'smooth' });
}

function setTypeFilter(type) {
  state.typeFilter = type;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  renderServicesTable();
}

// Server & Service Operations
async function validateServerConnection(uuid) {
  showToast('Iniciando validación y chequeo SSH con el servidor...', 'warning');
  try {
    const res = await CoolifyAPI.validateServer(uuid);
    showToast('Validación SSH completada con éxito. Servidor sincronizado.', 'success');
    await syncDashboardData();
  } catch (err) {
    showToast(`Fallo en validación SSH: ${err.message}`, 'error');
  }
}

async function restartService(uuid, name) {
  if (!confirm(`¿Deseas reiniciar el servicio "${name}"?`)) return;

  showToast(`Reiniciando ${name}...`, 'warning');
  try {
    await CoolifyAPI.restartApplication(uuid);
    showToast(`Servicio ${name} reiniciado con éxito`, 'success');
    setTimeout(syncDashboardData, 3000);
  } catch (err) {
    showToast(`Error al reiniciar ${name}: ${err.message}`, 'error');
  }
}

// Modals Logic
function openAddServerModal() {
  const modal = document.getElementById('addServerModal');
  if (!modal) return;
  modal.classList.add('open');

  // Pre-fill SSH command
  updateSshHelperCode();
}

function closeAddServerModal() {
  const modal = document.getElementById('addServerModal');
  if (modal) modal.classList.remove('open');
}

function updateSshHelperCode() {
  const ipInput = document.getElementById('serverIpInput');
  const userInput = document.getElementById('serverUserInput');
  const codePre = document.getElementById('sshCommandSnippet');
  if (!codePre) return;

  const ip = (ipInput && ipInput.value.trim()) || '<IP_DEL_SERVIDOR>';
  const user = (userInput && userInput.value.trim()) || 'root';
  const pubKey = state.activePublicKey;

  codePre.textContent = `mkdir -p ~/.ssh && echo "${pubKey}" >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`;
}

function openSshAgentModal(serverUuid, serverIp, serverUser) {
  const modal = document.getElementById('sshAgentModal');
  const codeSnippet = document.getElementById('sshAgentFullCommand');
  const targetLabel = document.getElementById('sshAgentTargetServer');
  if (!modal) return;

  if (targetLabel) targetLabel.textContent = `${serverUser}@${serverIp}`;
  if (codeSnippet) {
    codeSnippet.textContent = `# 1. Conéctate por SSH a tu servidor:\nssh ${serverUser}@${serverIp}\n\n# 2. Autoriza la clave pública de Coolify para gestión y monitoreo:\nmkdir -p ~/.ssh && echo "${state.activePublicKey}" >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys\n\n# 3. (Opcional) Verifica que Docker esté instalado:\ndocker --version || curl -fsSL https://get.docker.com | sh`;
  }

  modal.classList.add('open');
}

function closeSshAgentModal() {
  const modal = document.getElementById('sshAgentModal');
  if (modal) modal.classList.remove('open');
}

function openConfigModal() {
  const modal = document.getElementById('configModal');
  if (!modal) return;

  document.getElementById('cfgApiUrl').value = state.config.apiUrl;
  document.getElementById('cfgApiToken').value = state.config.apiToken;
  document.getElementById('cfgRefreshInterval').value = state.config.refreshInterval;

  modal.classList.add('open');
}

function closeConfigModal() {
  const modal = document.getElementById('configModal');
  if (modal) modal.classList.remove('open');
}

// Add Server Submission
async function handleAddServerSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('serverNameInput').value.trim();
  const ip = document.getElementById('serverIpInput').value.trim();
  const port = parseInt(document.getElementById('serverPortInput').value.trim(), 10) || 22;
  const user = document.getElementById('serverUserInput').value.trim() || 'root';
  const privateKeyUuid = document.getElementById('serverPrivateKeySelect').value;

  if (!ip) {
    showToast('La dirección IP del servidor es requerida', 'error');
    return;
  }

  if (!privateKeyUuid) {
    showToast('Debes seleccionar una clave privada SSH registrada en Coolify', 'error');
    return;
  }

  const submitBtn = document.getElementById('btnAddServerSubmit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registrando servidor en Coolify...';
  }

  try {
    const payload = {
      name: name || `Servidor-${ip}`,
      description: `Agregado desde SIS MONITOREO (${new Date().toLocaleDateString()})`,
      ip: ip,
      port: port,
      user: user,
      private_key_uuid: privateKeyUuid
    };

    showToast(`Registrando servidor ${ip} en Coolify...`, 'warning');
    const newServer = await CoolifyAPI.createServer(payload);

    showToast(`Servidor registrado con éxito. UUID: ${newServer.uuid || 'OK'}`, 'success');
    closeAddServerModal();

    // Trigger validation
    if (newServer.uuid) {
      setTimeout(() => {
        validateServerConnection(newServer.uuid);
      }, 1000);
    }

    await syncDashboardData();
  } catch (err) {
    console.error('Error adding server:', err);
    showToast(`Error al agregar servidor: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrar y Validar Servidor';
    }
  }
}

// Save Configuration Submission
function handleSaveConfig(e) {
  e.preventDefault();

  const apiUrl = document.getElementById('cfgApiUrl').value.trim();
  const apiToken = document.getElementById('cfgApiToken').value.trim();
  const refreshInterval = parseInt(document.getElementById('cfgRefreshInterval').value, 10) || 30;

  if (!apiUrl || !apiToken) {
    showToast('La URL de la API y el Token Bearer son requeridos', 'error');
    return;
  }

  saveConfig({ apiUrl, apiToken, refreshInterval });
  showToast('Configuración guardada correctamente', 'success');
  closeConfigModal();

  // Reset auto refresh timer
  setupAutoRefresh();
  syncDashboardData();
}

// Setup Auto Refresh Loop
function setupAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }

  if (state.config.refreshInterval > 0) {
    state.refreshTimer = setInterval(() => {
      syncDashboardData();
    }, state.config.refreshInterval * 1000);
  }
}

// HTML escape utility
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();

  // Event Listeners
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', syncDashboardData);

  const btnOpenAdd = document.getElementById('btnOpenAddServer');
  if (btnOpenAdd) btnOpenAdd.addEventListener('click', openAddServerModal);

  const btnOpenCfg = document.getElementById('btnOpenConfig');
  if (btnOpenCfg) btnOpenCfg.addEventListener('click', openConfigModal);

  const addForm = document.getElementById('addServerForm');
  if (addForm) addForm.addEventListener('submit', handleAddServerSubmit);

  const cfgForm = document.getElementById('configForm');
  if (cfgForm) cfgForm.addEventListener('submit', handleSaveConfig);

  const serverSelect = document.getElementById('serverFilterSelect');
  if (serverSelect) {
    serverSelect.addEventListener('change', (e) => {
      state.selectedServer = e.target.value;
      updateUI();
    });
  }

  const searchInput = document.getElementById('serviceSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderServicesTable();
    });
  }

  const ipInput = document.getElementById('serverIpInput');
  if (ipInput) ipInput.addEventListener('input', updateSshHelperCode);

  const userInput = document.getElementById('serverUserInput');
  if (userInput) userInput.addEventListener('input', updateSshHelperCode);

  // Filter Buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => setTypeFilter(btn.dataset.type));
  });

  // Start Sync & Auto-refresh
  syncDashboardData();
  setupAutoRefresh();
});
