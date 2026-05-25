# Dory's Bakehouse — Website v4

## Quick Start
```bash
npm install
npm start
```
Server runs at http://localhost:3000  
Admin panel: http://localhost:3000/admin  
Instagram setup: http://localhost:3000/instagram-setup.html

## Image Formats Supported
All formats are automatically converted to JPEG on upload:
- ✅ HEIC / HEIF (iPhone photos)
- ✅ JPEG / JPG
- ✅ PNG
- ✅ WebP
- ✅ TIFF / TIF
- ✅ BMP
- ✅ AVIF
- ✅ GIF
- ✅ RAW formats (CR2, NEF, ARW, DNG) — requires libvips with RAW support

Powered by [sharp](https://sharp.pixelplumbing.com/) — installed automatically via `npm install`.

## Environment Variables (.env)
```
PORT=3000
DB_PATH=/data/dorys.db         # For hosted servers (Render, Railway etc)
DOMAIN=https://www.dorysbakes.com
```

## Instagram Integration
1. Visit /instagram-setup.html
2. Follow the 8-step guide to get your Instagram access token
3. Paste it in and click Connect
4. Photos sync automatically every 6 hours

## Deployment (Render / Railway)
- Set DB_PATH env var to a persistent disk path
- Set DOMAIN to your actual domain
- Run `npm install` (sharp is included)
