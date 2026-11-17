# NASA Explorer — PWA

Aplicación web progresiva para consultar NASA Open APIs. Incluye Astronomy Picture of the Day (APOD), búsqueda diaria de objetos cercanos a la Tierra (NeoWs), filtro por nombre y peligrosidad, detalles, control de errores y caché local para consultar los últimos resultados sin conexión. Para asteroides, busca fotografías relacionadas en NASA Image and Video Library cuando el nombre coincide claramente con el título de una imagen; NeoWs no proporciona fotos y muchos objetos no tienen una fotografía real archivada.

## Ejecutar localmente

El service worker requiere HTTPS o `localhost`. Desde esta carpeta inicia un servidor estático:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000`; no abras `index.html` directamente como archivo.

## API key y uso

La clave de esta instalación local se carga automáticamente desde `config.local.js`; no hace falta volver a pegarla en la interfaz. Ese archivo está excluido de Git mediante `.gitignore`.

1. Inicia la PWA en localhost con Live Server o `python -m http.server 8000`.
2. Al abrir la app se consulta la imagen APOD del día. Pulsa **Asteroides cercanos** para cargar NeoWs; allí puedes cambiar la fecha, filtrar por nombre o ver solo los clasificados como potencialmente peligrosos.
3. Si NASA revoca o limita la clave, solicita una nueva en [NASA API signup](https://api.nasa.gov/index.html#signUp) y actualiza `apiKey` en `config.local.js`.

APOD usa el endpoint APOD Basic de NASA Science (`GET https://science.nasa.gov/wp-json/wp/v2/apod-basic`) con los filtros de fecha `date_from` y `date_to` en formato `YYMMDD`; no requiere API key. NeoWs usa `GET /neo/rest/v1/feed` con el parámetro `api_key`. La clave local puede verse en las herramientas de desarrollo y en el archivo servido por Live Server: **esta configuración es únicamente para uso local; no publiques ni despliegues `config.local.js`**. Para una web pública, usa un backend que proteja la clave y aplique límites.

**Seguridad:** si una API key se comparte en un chat o se publica por accidente, revócala y genera una nueva desde el portal de NASA. No subas la clave a Postman Cloud ni a un repositorio público.

## PWA y modo sin conexión

- `manifest.json` define el nombre, icono, colores y modo de instalación.
- `service-worker.js` precarga la interfaz y ofrece el shell de la app cuando no hay conexión.
- Los últimos datos de APOD y NeoWs se guardan por separado en `localStorage`; el filtro y la exploración de esos datos siguen funcionando sin conexión.
- Las consultas nuevas, las imágenes remotas y los recursos originales requieren conexión.

## Validar en Postman

Importa [`postman/NASA-Open-APIs.postman_collection.json`](./postman/NASA-Open-APIs.postman_collection.json). Configura `api_key` en un environment local de Postman para NeoWs; la solicitud APOD usa el nuevo endpoint APOD Basic y no necesita esa clave. Ejecuta las solicitudes **APOD / Imagen del día** y **NeoWs / Objetos cercanos por fecha** para verificar las respuestas.

## Referencias

- [NASA Open APIs](https://api.nasa.gov/index.html)
- [APOD Basic y guía de feeds](https://api.nasa.gov/assets/files/apod/APOD-APIs-and-RSS-info.pdf)
- [NeoWs](https://api.nasa.gov/)

El contenido y las imágenes se sirven desde NASA Open APIs; la atribución y los derechos de cada imagen corresponden a sus fuentes y autores.
