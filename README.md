# Bajcookies Menu Website

This repository now contains a publishable static menu website based on your menu hierarchy.

## What was done

1. Built a structured final menu in [data/menu.json](data/menu.json).
2. Detected and handled duplicate photos (1 exact duplicate by hash).
3. Organized photos into menu-based folders in [assets/images/menu](assets/images/menu).
4. Generated a photo mapping manifest in [data/photo-manifest.json](data/photo-manifest.json).
5. Created a responsive website entry page in [index.html](index.html).
6. Added GitHub Pages workflow in [.github/workflows/pages.yml](.github/workflows/pages.yml).

## Project structure

- [index.html](index.html) - main page
- [assets/css/styles.css](assets/css/styles.css) - styles
- [assets/js/app.js](assets/js/app.js) - rendering logic
- [data/menu.json](data/menu.json) - editable menu content
- [data/photo-manifest.json](data/photo-manifest.json) - generated image mapping
- [scripts/organize-photos.ps1](scripts/organize-photos.ps1) - photo organization script

## Run locally

Because the site fetches JSON files, open it through a local server (not direct file open).

If Python is installed:

- `python -m http.server 5500`
- Open `http://localhost:5500`

## Re-organize photos again

Run PowerShell in the project root:

- `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force`
- `./scripts/organize-photos.ps1`

This will:

- deduplicate by SHA256
- keep unique files
- distribute images into menu item folders
- regenerate [data/photo-manifest.json](data/photo-manifest.json)

## Publish on GitHub Pages

1. Create a GitHub repository and push this project.
2. Ensure default branch is `main`.
3. In repository settings, enable Pages with **GitHub Actions** as source.
4. Push changes to `main`; deployment runs automatically.

## Editing guide

- Update item names, descriptions, and prices in [data/menu.json](data/menu.json).
- Keep item IDs stable if you want existing photo mapping to continue working.
- To manually control image assignments, edit [data/photo-manifest.json](data/photo-manifest.json) bucket entries.

## Troubleshooting

- If images do not show, verify paths in [data/photo-manifest.json](data/photo-manifest.json).
- If menu does not load, verify JSON syntax in both data files.
- If script execution is blocked, run execution policy command for current process first.
