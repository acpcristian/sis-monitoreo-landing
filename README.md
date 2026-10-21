# SIS MONITOREO — Landing Page

Landing profesional para tu sistema de monitoreo de servicios y aplicaciones web autohospedado.

## Estructura

```
landing-sis-monitoreo/
├── index.html          # Página principal
├── css/
│   └── style.css       # Estilos (tema oscuro, responsive, sin dependencias)
└── js/
    └── main.js         # Menú móvil, FAQ, scroll, animaciones al hacer scroll
```

## Cómo verla

1. Abre `index.html` directamente en tu navegador, o
2. Sirvela con cualquier servidor estático, por ejemplo con Python:

   ```bash
   python -m http.server 8000
   ```
   Luego visita `http://localhost:8000`.

## Personalización rápida

- **Colores:** edita las variables CSS al inicio de `css/style.css` (`:root`).
- **Texto y marca:** modifica `index.html` (títulos, copia, precios, enlaces).
- **Imágenes:** la landing usa íconos SVG integrados y un maquetado de dashboard hecho con CSS, así que no depende de imágenes externas. Solo la fuente "Inter" se carga desde Google Fonts (puedes quitarla si quieres que sea 100 % offline).

## Despliegue

Siendo archivos estáticos, puedes subir la carpeta a:
- Tu propio servidor (Nginx / Apache / Caddy)
- GitHub Pages, Vercel o Netlify

No requiere backend ni base de datos para la landing en sí.
