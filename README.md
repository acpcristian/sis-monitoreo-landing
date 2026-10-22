# SIS MONITOREO — Plataforma de Monitoreo de Servidores y Servicios

Sistema profesional de monitoreo de servidores, contenedores Docker y aplicaciones autohospedadas con integración directa a la API de Coolify.

## Estructura del Proyecto

```
landing-sis-monitoreo/
├── index.html          # Landing page principal
├── dashboard.html      # Panel de Control interactivo de Monitoreo
├── css/
│   ├── style.css       # Estilos de la landing
│   └── dashboard.css   # Estilos glassmorphism y responsive del dashboard
└── js/
    ├── main.js         # Lógica interactiva de la landing
    └── dashboard.js    # Conexión con Coolify API, gestión de servidores por IP y monitoreo en tiempo real
```

## Características del Panel (`dashboard.html`)

- **Gestión de Servidores por IP:** Registro de nuevos servidores mediante IP, puerto SSH, usuario y clave privada SSH en Coolify.
- **Detección Automática de Servicios:** Consulta en tiempo real a Coolify para listar aplicaciones web, bases de datos (Postgres, MySQL, Redis, MongoDB), proxies (Traefik) y contenedores.
- **Estado en Vivo:** Indicadores luminosos de estado (En Ejecución, Degradado, Fuera de línea) y latencia hacia el orquestador.
- **Acciones Rápidas:** Validación de conectividad SSH, reinicio de servicios, copia rápida de IP y enlaces directos a URLs y panel de Coolify.
- **Asistente de Agente / SSH:** Generación del comando de 1 línea para autorizar la clave SSH de Coolify en cualquier servidor remoto.
- **Configuración Personalizable:** Panel para configurar la URL de la API, token Bearer e intervalo de auto-refresco (10s, 30s, 60s).

## Despliegue en Coolify

Este proyecto se despliega automáticamente en Coolify mediante Nginx estático conectando a la rama `main` del repositorio `acpcristian/sis-monitoreo-landing`.

