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

// ============================================================
//  LOG REPORT SYSTEM — SIS MONITOREO
//  Fetch, parse, categorize, and display server logs
// ============================================================

// Log Report State
const logReportState = {
  serverUuid: null,
  serverName: '',
  serverIp: '',
  rawLines: [],
  filteredLines: [],
  activeCategory: 'all',
  searchQuery: '',
  generatedAt: null,
};

// ---- API Methods for Logs ----
class LogAPI {
  static async getServerLogs(serverUuid) {
    try {
      const data = await CoolifyAPI.request(`/servers/${serverUuid}/logs`);
      if (data && (data.logs || data.data || Array.isArray(data))) {
        const raw = data.logs || data.data || data;
        return Array.isArray(raw) ? raw.join('\n') : String(raw);
      }
    } catch (_) {}

    try {
      const resources = await CoolifyAPI.request(`/servers/${serverUuid}/resources`);
      const lines = [];
      if (Array.isArray(resources)) {
        resources.forEach(r => {
          if (r.status) lines.push(`[INFO] ${r.name || r.id}: status=${r.status}`);
          if (r.last_deployment_status) {
            const lvl = r.last_deployment_status === 'finished' ? 'SUCCESS' : 'WARNING';
            lines.push(`[${lvl}] ${r.name}: last_deploy=${r.last_deployment_status}`);
          }
        });
      }
      if (lines.length > 0) return lines.join('\n');
    } catch (_) {}

    return null;
  }

  static async getApplicationLogs(serverUuid) {
    const logs = [];
    const serverApps = state.services.filter(
      s => s.serverUuid === serverUuid && s.type === 'application' && s.uuid
    );
    await Promise.allSettled(serverApps.slice(0, 5).map(async app => {
      try {
        const data = await CoolifyAPI.request(`/applications/${app.uuid}/logs`);
        const raw = data?.logs || data?.data || '';
        if (raw) {
          logs.push(`\n--- [APP: ${app.name}] ---`);
          logs.push(typeof raw === 'string' ? raw : raw.join('\n'));
        }
      } catch (_) {}
    }));
    return logs.join('\n');
  }
}

// ---- Log Parser ----
function classifyLogLine(text) {
  const t = text.toLowerCase();
  if (/\b(error|err|fatal|critical|exception|traceback|failed|failure|panic|crash|abort|undefined|null pointer|segfault|oom|killed|denied|refused|cannot|unable to|no such|not found|timed out|connection reset)\b/.test(t)) return 'error';
  if (/\b(warn(?:ing)?|deprecated|slow|retry|retrying|timeout(?:ed)?|missing|skipping|ignored|attention|caution|high (?:cpu|memory|load)|overload)\b/.test(t)) return 'warning';
  if (/\b(success(?:ful(?:ly)?)?|ok\b|done|started|running|healthy|ready|deployed|connected|accepted|created|registered|completed|200|201|204)\b/.test(t)) return 'success';
  if (/\b(debug|trace|verbose|diag)\b/.test(t)) return 'debug';
  if (/^\[?(info|notice|log)\]?[\s:]/.test(t)) return 'info';
  if (/\s[45]\d{2}\s/.test(t)) return 'error';
  if (/\s[23]\d{2}\s/.test(t)) return 'success';
  return 'info';
}

function extractTimestamp(text) {
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/);
  if (isoMatch) return isoMatch[0].replace('T', ' ');
  const timeMatch = text.match(/\d{2}:\d{2}:\d{2}/);
  if (timeMatch) return timeMatch[0];
  return '';
}

function parseLogLines(rawText) {
  if (!rawText) return [];
  return rawText
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
    .map((line, idx) => ({
      idx: idx + 1,
      raw: line,
      level: classifyLogLine(line),
      time: extractTimestamp(line),
      text: line.replace(/^\[?(ERROR|WARN(?:ING)?|INFO|DEBUG|SUCCESS|NOTICE|TRACE|FATAL|CRITICAL)\]?[\s:]*/i, '').trim() || line,
    }));
}

function buildInsights(lines, serverName) {
  const counts = { error: 0, warning: 0, info: 0, success: 0, debug: 0 };
  lines.forEach(l => { if (counts[l.level] !== undefined) counts[l.level]++; });
  const total = lines.length;
  const insights = [];

  if (total === 0) {
    insights.push({ color: 'blue', text: 'No se encontraron logs disponibles. Verifica que el agente Sentinel esté activo.' });
    return insights;
  }
  if (counts.error > 0) {
    const pct = Math.round((counts.error / total) * 100);
    if (pct >= 20) {
      insights.push({ color: 'red', text: `Alta tasa de errores: ${counts.error} errores (${pct}% del total). Se recomienda revisión inmediata.` });
    } else {
      insights.push({ color: 'red', text: `Se detectaron ${counts.error} error(es). Revisa los registros en rojo para identificar la causa raíz.` });
    }
  }
  if (counts.warning > 0) {
    insights.push({ color: 'yellow', text: `${counts.warning} advertencia(s) registradas. Pueden indicar degradación de rendimiento o configuraciones pendientes.` });
  }
  if (counts.success > 0) {
    insights.push({ color: 'green', text: `${counts.success} eventos exitosos confirmados. Los servicios responden correctamente.` });
  }
  if (counts.error === 0 && counts.warning === 0) {
    insights.push({ color: 'green', text: `✓ Sin errores ni advertencias. El servidor "${serverName}" opera en condiciones óptimas.` });
  }
  if (counts.debug > 0) {
    insights.push({ color: 'blue', text: `${counts.debug} líneas de depuración presentes. Considera reducir el nivel de log en producción.` });
  }

  const runningCount = state.services.filter(s => s.serverUuid === logReportState.serverUuid && (s.status.includes('running') || s.status.includes('healthy'))).length;
  const totalOnServer = state.services.filter(s => s.serverUuid === logReportState.serverUuid).length;
  if (totalOnServer > 0) {
    insights.push({ color: runningCount === totalOnServer ? 'green' : 'yellow', text: `${runningCount}/${totalOnServer} servicios activos en este servidor al momento del reporte.` });
  }
  return insights;
}

function calculateHealthScore(lines) {
  if (lines.length === 0) return 70;
  const errors   = lines.filter(l => l.level === 'error').length;
  const warnings = lines.filter(l => l.level === 'warning').length;
  const total    = lines.length;
  const errorPenalty = Math.min((errors / total) * 60, 60);
  const warnPenalty  = Math.min((warnings / total) * 20, 20);
  return Math.max(0, Math.round(100 - errorPenalty - warnPenalty));
}

// ---- UI Rendering ----
function renderLogLines() {
  const container = document.getElementById('logLinesContainer');
  if (!container) return;

  let lines = logReportState.rawLines;
  if (logReportState.activeCategory !== 'all') {
    lines = lines.filter(l => l.level === logReportState.activeCategory);
  }
  if (logReportState.searchQuery.trim()) {
    const q = logReportState.searchQuery.toLowerCase();
    lines = lines.filter(l => l.raw.toLowerCase().includes(q));
  }
  logReportState.filteredLines = lines;

  if (lines.length === 0) {
    container.innerHTML = `
      <div class="log-empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>No hay logs en esta categoría</span>
      </div>`;
    return;
  }

  const BADGE = { error: 'ERROR', warning: 'WARN', info: 'INFO', success: 'OK', debug: 'DEBUG' };
  container.innerHTML = lines.map(l => `
    <div class="log-line lvl-${l.level}">
      <span class="log-line-num">${l.idx}</span>
      <span class="log-line-badge">${BADGE[l.level] || 'INFO'}</span>
      <span class="log-line-text">${escapeHtml(l.text)}</span>
      ${l.time ? `<span class="log-line-time">${l.time}</span>` : ''}
    </div>
  `).join('');
}

function updateCategoryCards() {
  const counts = { error: 0, warning: 0, info: 0, success: 0 };
  logReportState.rawLines.forEach(l => { if (counts[l.level] !== undefined) counts[l.level]++; });
  document.getElementById('catCountError').textContent   = counts.error;
  document.getElementById('catCountWarning').textContent = counts.warning;
  document.getElementById('catCountInfo').textContent    = counts.info;
  document.getElementById('catCountSuccess').textContent = counts.success;
  ['error', 'warning', 'info', 'success'].forEach(cat => {
    const card = document.getElementById(`catCard${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    if (card) card.classList.toggle('active-cat', logReportState.activeCategory === cat);
  });
}

function renderHealthScore(score) {
  const ring    = document.getElementById('healthScoreRing');
  const numEl   = document.getElementById('healthScoreNum');
  const titleEl = document.getElementById('healthScoreTitle');
  const descEl  = document.getElementById('healthScoreDesc');
  const barEl   = document.getElementById('healthProgressBar');
  if (!ring || !numEl) return;

  const circumference = 188.4;
  ring.style.strokeDashoffset = circumference - (score / 100) * circumference;

  let color, title, desc;
  if (score >= 85) {
    color = '#10b981'; title = '✓ Servidor Saludable';
    desc  = 'El análisis de logs no revela problemas críticos. El sistema opera con normalidad.';
  } else if (score >= 60) {
    color = '#f59e0b'; title = '⚠ Atención Recomendada';
    desc  = 'Se detectaron advertencias o errores moderados. Revisa los eventos marcados para evitar degradación.';
  } else {
    color = '#ef4444'; title = '✗ Problemas Detectados';
    desc  = 'Alta frecuencia de errores. Se recomienda revisión inmediata de los servicios y configuraciones del servidor.';
  }
  ring.style.stroke = color;
  numEl.textContent = score;
  numEl.style.color = color;
  if (titleEl) { titleEl.textContent = title; titleEl.style.color = color; }
  if (descEl)  descEl.textContent = desc;
  if (barEl)   { barEl.style.width = `${score}%`; barEl.style.background = color; }
}

function renderInsights(insights) {
  const list = document.getElementById('insightList');
  if (!list) return;
  list.innerHTML = insights.map(i => `
    <li class="insight-item">
      <span class="insight-dot ${i.color}"></span>
      <span>${escapeHtml(i.text)}</span>
    </li>
  `).join('');
}

// ---- Interactions ----
function filterLogsByCategory(category) {
  logReportState.activeCategory = category;
  updateCategoryCards();
  renderLogLines();
}

function filterLogLines(query) {
  logReportState.searchQuery = query;
  renderLogLines();
}

// ---- Modal Open / Close ----
async function openLogReportModal(serverUuid, serverName, serverIp) {
  const modal = document.getElementById('logReportModal');
  if (!modal) return;

  logReportState.serverUuid     = serverUuid;
  logReportState.serverName     = serverName;
  logReportState.serverIp       = serverIp;
  logReportState.rawLines       = [];
  logReportState.filteredLines  = [];
  logReportState.activeCategory = 'all';
  logReportState.searchQuery    = '';
  logReportState.generatedAt    = new Date();

  const nameEl   = document.getElementById('reportServerName');
  const ipEl     = document.getElementById('reportServerIp');
  const dateEl   = document.getElementById('reportGeneratedAt');
  const totalEl  = document.getElementById('reportTotalLines');
  const footerEl = document.getElementById('reportFooterInfo');

  if (nameEl)  nameEl.textContent  = `Reporte — ${serverName}`;
  if (ipEl)    ipEl.textContent    = serverIp;
  if (dateEl)  dateEl.textContent  = logReportState.generatedAt.toLocaleString('es-BO');
  if (totalEl) totalEl.textContent = 'Cargando...';
  if (footerEl) footerEl.textContent = `Generado el ${logReportState.generatedAt.toLocaleString('es-BO')}`;

  document.getElementById('logLinesContainer').innerHTML = `
    <div class="log-loading-state">
      <div class="log-spinner"></div>
      <span>Obteniendo logs del servidor...</span>
    </div>`;
  document.getElementById('insightList').innerHTML = `
    <li class="insight-item"><span class="insight-dot blue"></span><span>Analizando logs...</span></li>`;
  ['catCountError','catCountWarning','catCountInfo','catCountSuccess'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '–';
  });
  renderHealthScore(0);

  const searchEl = document.getElementById('logSearchInput');
  if (searchEl) searchEl.value = '';

  const refreshBtn = document.getElementById('btnRefreshLogs');
  if (refreshBtn) refreshBtn.onclick = () => loadAndRenderLogs();

  modal.classList.add('open');
  await loadAndRenderLogs();
}

async function loadAndRenderLogs() {
  const refreshBtn = document.getElementById('btnRefreshLogs');
  if (refreshBtn) refreshBtn.classList.add('spinning');

  try {
    const [serverRaw, appRaw] = await Promise.all([
      LogAPI.getServerLogs(logReportState.serverUuid),
      LogAPI.getApplicationLogs(logReportState.serverUuid),
    ]);

    let combined = [serverRaw, appRaw].filter(Boolean).join('\n');
    if (!combined.trim()) {
      combined = generateDiagnosticLog(logReportState.serverUuid, logReportState.serverName, logReportState.serverIp);
    }

    logReportState.rawLines     = parseLogLines(combined);
    logReportState.generatedAt  = new Date();

    const totalEl  = document.getElementById('reportTotalLines');
    const footerEl = document.getElementById('reportFooterInfo');
    if (totalEl)  totalEl.textContent  = `${logReportState.rawLines.length} líneas`;
    if (footerEl) footerEl.textContent = `Generado el ${logReportState.generatedAt.toLocaleString('es-BO')} — ${logReportState.rawLines.length} entradas`;

    renderHealthScore(calculateHealthScore(logReportState.rawLines));
    updateCategoryCards();
    renderInsights(buildInsights(logReportState.rawLines, logReportState.serverName));
    renderLogLines();
  } catch (err) {
    console.error('Log fetch error:', err);
    document.getElementById('logLinesContainer').innerHTML = `
      <div class="log-empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
        <span style="color:#fca5a5;">Error al obtener logs: ${escapeHtml(err.message)}</span>
      </div>`;
    showToast(`Error al cargar logs: ${err.message}`, 'error');
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }
}

function generateDiagnosticLog(serverUuid, serverName, serverIp) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const server = state.servers.find(s => s.uuid === serverUuid);
  const serverServices = state.services.filter(s => s.serverUuid === serverUuid);
  const lines = [];

  lines.push(`[INFO] ${now} SIS MONITOREO — Reporte Diagnóstico Generado`);
  lines.push(`[INFO] ${now} Servidor: ${serverName} (${serverIp})`);
  lines.push(`[INFO] ${now} Estado de conectividad: ${server?.is_reachable ? 'ACCESIBLE' : 'INACCESIBLE'}`);

  if (!server?.is_reachable) {
    lines.push(`[ERROR] ${now} El servidor ${serverIp} no responde. Verifica la conexión de red y el firewall.`);
  } else {
    lines.push(`[SUCCESS] ${now} Conexión SSH verificada con ${serverIp}`);
  }

  if (server?.settings?.is_sentinel_enabled) {
    lines.push(`[SUCCESS] ${now} Agente Sentinel activo — Métricas del sistema disponibles`);
  } else {
    lines.push(`[WARNING] ${now} Agente Sentinel no activo — Las métricas detalladas no están disponibles`);
  }

  if (server?.proxy?.status === 'running') {
    lines.push(`[SUCCESS] ${now} Traefik Reverse Proxy en ejecución (puertos 80, 443, 8080)`);
  }

  lines.push(`[INFO] ${now} Total de servicios en el servidor: ${serverServices.length}`);

  serverServices.forEach(svc => {
    const isRunning = svc.status.includes('running') || svc.status.includes('healthy');
    const lvl = isRunning ? 'SUCCESS' : (svc.status.includes('degraded') ? 'WARNING' : 'ERROR');
    lines.push(`[${lvl}] ${now} ${svc.typeName}: ${svc.name} — Estado: ${svc.status}`);
    if (svc.fqdn) lines.push(`[INFO] ${now}   Dominio: ${svc.fqdn}`);
    if (!isRunning) lines.push(`[ERROR] ${now}   El servicio "${svc.name}" no está en ejecución. Requiere atención.`);
  });

  if (serverServices.length === 0) {
    lines.push(`[WARNING] ${now} No se detectaron servicios registrados en este servidor`);
  }

  const runningCount = serverServices.filter(s => s.status.includes('running') || s.status.includes('healthy')).length;
  const uptime = serverServices.length > 0 ? Math.round((runningCount / serverServices.length) * 100) : 0;
  lines.push(`[INFO] ${now} Uptime de servicios: ${runningCount}/${serverServices.length} (${uptime}%)`);

  if (uptime === 100 && serverServices.length > 0) {
    lines.push(`[SUCCESS] ${now} Todos los servicios operan con normalidad`);
  } else if (uptime >= 50) {
    lines.push(`[WARNING] ${now} Algunos servicios requieren atención — Uptime por debajo del 100%`);
  } else if (serverServices.length > 0) {
    lines.push(`[ERROR] ${now} Múltiples servicios caídos — Revisar infraestructura inmediatamente`);
  }

  lines.push(`[INFO] ${now} --- FIN DEL REPORTE DIAGNÓSTICO ---`);
  return lines.join('\n');
}

function closeLogReportModal() {
  const modal = document.getElementById('logReportModal');
  if (modal) modal.classList.remove('open');
}

// ---- Export Functions ----
function buildReportText() {
  const { serverName, serverIp, generatedAt, rawLines } = logReportState;
  const dt = generatedAt ? generatedAt.toLocaleString('es-BO') : '--';
  const counts = { error: 0, warning: 0, info: 0, success: 0, debug: 0 };
  rawLines.forEach(l => { if (counts[l.level] !== undefined) counts[l.level]++; });
  const sep = '='.repeat(70);
  return [
    sep,
    '  SIS MONITOREO — REPORTE DE LOGS',
    `  Servidor  : ${serverName}`,
    `  IP        : ${serverIp}`,
    `  Generado  : ${dt}`,
    `  Total     : ${rawLines.length} líneas`,
    sep,
    '  RESUMEN DE CATEGORÍAS',
    `  ● Errores      : ${counts.error}`,
    `  ● Advertencias : ${counts.warning}`,
    `  ● Info         : ${counts.info}`,
    `  ● Exitosos     : ${counts.success}`,
    `  ● Debug        : ${counts.debug}`,
    sep, '',
    ...rawLines.map(l => `[${l.level.toUpperCase().padEnd(7)}] ${l.time ? l.time + '  ' : ''}${l.text}`),
    '',
    sep,
    '  FIN DEL REPORTE — SIS MONITOREO',
    sep,
  ].join('\n');
}

function exportReportAsText() {
  const text = buildReportText();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0,19).replace(/[T:]/g, '-');
  a.href = url;
  a.download = `reporte-logs-${logReportState.serverName.replace(/\s+/g, '_')}-${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Reporte exportado correctamente', 'success');
}

function copyReportToClipboard() {
  copyToClipboard(buildReportText(), 'Reporte copiado al portapapeles');
}

// ---- Inject "Generar Reporte" button into each server card ----
// We patch renderServerCards after its definition
(function patchRenderServerCards() {
  const _original = window.renderServerCards || renderServerCards;
  const patched = function() {
    _original();
    document.querySelectorAll('.server-card[data-uuid]').forEach(card => {
      const uuid = card.dataset.uuid;
      const server = state.servers.find(s => s.uuid === uuid);
      if (!server) return;
      const actionsRow = card.querySelector('.server-card-actions');
      if (!actionsRow || actionsRow.querySelector('.btn-report-logs')) return;

      const reportBtn = document.createElement('button');
      reportBtn.className = 'btn-report-logs';
      reportBtn.style.cssText = [
        'display:inline-flex; align-items:center; gap:5px;',
        'padding:6px 12px; font-size:0.8rem; font-weight:600;',
        'background:linear-gradient(135deg,rgba(129,140,248,0.15),rgba(6,182,212,0.1));',
        'border:1px solid rgba(129,140,248,0.35); border-radius:6px;',
        'color:#a5b4fc; cursor:pointer; transition:all 200ms; white-space:nowrap;',
      ].join('');
      reportBtn.title = 'Generar reporte de logs para este servidor';
      reportBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        Reporte de Logs`;
      reportBtn.onmouseenter = () => {
        reportBtn.style.background = 'linear-gradient(135deg,rgba(129,140,248,0.28),rgba(6,182,212,0.18))';
        reportBtn.style.borderColor = 'rgba(129,140,248,0.6)';
        reportBtn.style.boxShadow   = '0 0 14px rgba(129,140,248,0.2)';
        reportBtn.style.color = '#c7d2fe';
      };
      reportBtn.onmouseleave = () => {
        reportBtn.style.background = 'linear-gradient(135deg,rgba(129,140,248,0.15),rgba(6,182,212,0.1))';
        reportBtn.style.borderColor = 'rgba(129,140,248,0.35)';
        reportBtn.style.boxShadow   = '';
        reportBtn.style.color = '#a5b4fc';
      };
      reportBtn.onclick = () => openLogReportModal(server.uuid, server.name, server.ip);

      actionsRow.insertBefore(reportBtn, actionsRow.firstChild);
      actionsRow.style.flexWrap = 'wrap';
      actionsRow.style.gap = '6px';
    });
  };
  // Override global reference
  window.renderServerCards = patched;
  // Also reassign so the updateUI call picks it up
  if (typeof renderServerCards !== 'undefined') {
    // We've already patched via window, updateUI references renderServerCards directly,
    // so we reassign the local reference by patching updateUI as well
    const _origUpdateUI = updateUI;
    window.updateUI = function() {
      _origUpdateUI();
      // inject buttons after updateUI finishes rendering cards
      document.querySelectorAll('.server-card[data-uuid]').forEach(card => {
        const uuid = card.dataset.uuid;
        const server = state.servers.find(s => s.uuid === uuid);
        if (!server) return;
        const actionsRow = card.querySelector('.server-card-actions');
        if (!actionsRow || actionsRow.querySelector('.btn-report-logs')) return;

        const btn = document.createElement('button');
        btn.className = 'btn-report-logs';
        btn.style.cssText = [
          'display:inline-flex; align-items:center; gap:5px;',
          'padding:6px 12px; font-size:0.8rem; font-weight:600;',
          'background:linear-gradient(135deg,rgba(129,140,248,0.15),rgba(6,182,212,0.1));',
          'border:1px solid rgba(129,140,248,0.35); border-radius:6px;',
          'color:#a5b4fc; cursor:pointer; transition:all 200ms; white-space:nowrap;',
        ].join('');
        btn.title = 'Generar reporte de logs para este servidor';
        btn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          Reporte de Logs`;
        btn.onmouseenter = () => {
          btn.style.background = 'linear-gradient(135deg,rgba(129,140,248,0.28),rgba(6,182,212,0.18))';
          btn.style.borderColor = 'rgba(129,140,248,0.6)';
          btn.style.boxShadow   = '0 0 14px rgba(129,140,248,0.2)';
          btn.style.color = '#c7d2fe';
        };
        btn.onmouseleave = () => {
          btn.style.background = 'linear-gradient(135deg,rgba(129,140,248,0.15),rgba(6,182,212,0.1))';
          btn.style.borderColor = 'rgba(129,140,248,0.35)';
          btn.style.boxShadow   = '';
          btn.style.color = '#a5b4fc';
        };
        btn.onclick = () => openLogReportModal(server.uuid, server.name, server.ip);

        actionsRow.insertBefore(btn, actionsRow.firstChild);
        actionsRow.style.flexWrap = 'wrap';
        actionsRow.style.gap = '6px';
      });
    };
  }
})();
